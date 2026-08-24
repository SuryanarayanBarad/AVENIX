import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * ---------------------------------------------------------------------------
 * Profile image storage
 * ---------------------------------------------------------------------------
 * Images arrive as data URLs on the existing JSON API, are validated by
 * declared MIME *and* magic bytes, then stored. Only the resulting URL is kept
 * in PostgreSQL — binaries never go into the database.
 *
 * Storage backend is chosen at boot:
 *   - Supabase Storage when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set.
 *     This is the production path: hosts like Cloud Run have an ephemeral
 *     filesystem, so local files vanish on every deploy.
 *   - Local disk otherwise, so development works with no cloud credentials.
 *
 * The service-role key is read from the environment inside this server-only
 * module. It is never sent to the browser and never returned by any endpoint.
 */

export const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), 'uploads');

/** Public URL prefix the Express static handler serves UPLOAD_ROOT from. */
export const UPLOAD_URL_PREFIX = '/uploads';

/** Bucket holding user-uploaded images. Must exist and be public-read. */
export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'queue-images';

/** 4 MB of decoded image data. Data URLs inflate ~33%, so the JSON body cap is larger. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export type ImageFolder = 'doctors' | 'avatars';

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/** Magic-byte signatures — a caller cannot smuggle a script through by lying about MIME. */
const SIGNATURES: { ext: string; mime: string; test: (b: Buffer) => boolean }[] = [
  { ext: '.png', mime: 'image/png', test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: '.jpg', mime: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.webp', mime: 'image/webp', test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
  { ext: '.gif', mime: 'image/gif', test: (b) => b.length > 6 && b.toString('ascii', 0, 3) === 'GIF' },
];

export class ImageValidationError extends Error {}

const DATA_URL_PATTERN = /^data:([a-zA-Z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/;

// ---------------------------------------------------------------------------
// Backend selection
// ---------------------------------------------------------------------------

let supabase: SupabaseClient | null = null;

/**
 * The Supabase admin client, or null when credentials are absent.
 * Created lazily so importing this module never requires cloud config.
 */
function storageClient(): SupabaseClient | null {
  if (supabase) return supabase;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabase;
}

export function isRemoteStorageEnabled(): boolean {
  return storageClient() !== null;
}

/** Which backend is in use, for the health endpoint. Never reveals credentials. */
export function storageBackend(): 'supabase' | 'local-disk' {
  return isRemoteStorageEnabled() ? 'supabase' : 'local-disk';
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface ValidatedImage {
  buffer: Buffer;
  ext: string;
  mime: string;
}

function validateDataUrl(dataUrl: string): ValidatedImage {
  if (typeof dataUrl !== 'string' || dataUrl.length === 0) {
    throw new ImageValidationError('No image data was provided.');
  }

  const match = DATA_URL_PATTERN.exec(dataUrl.trim());
  if (!match) {
    throw new ImageValidationError('The image must be a base64 data URL (data:image/png;base64,...).');
  }

  const mime = match[1].toLowerCase();
  if (!MIME_EXTENSIONS[mime]) {
    throw new ImageValidationError('Unsupported image type. Use PNG, JPEG, WebP, or GIF.');
  }

  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (buffer.length === 0) {
    throw new ImageValidationError('The image data could not be decoded.');
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new ImageValidationError(`The image is too large. Maximum size is ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB.`);
  }

  // The declared type is not trusted; the bytes decide.
  const signature = SIGNATURES.find((candidate) => candidate.test(buffer));
  if (!signature) {
    throw new ImageValidationError('The uploaded file is not a valid image.');
  }

  return { buffer, ext: signature.ext, mime: signature.mime };
}

// ---------------------------------------------------------------------------
// Public API — unchanged signatures, so callers did not need to change
// ---------------------------------------------------------------------------

/**
 * Validate a data-URL image and persist it.
 * Returns the URL to store on the record: an absolute Supabase URL in
 * production, or a served `/uploads/...` path when running on local disk.
 */
export async function saveDataUrlImage(dataUrl: string, folder: ImageFolder): Promise<string> {
  const { buffer, ext, mime } = validateDataUrl(dataUrl);
  const objectPath = `${folder}/${randomUUID()}${ext}`;

  const client = storageClient();
  if (client) {
    const { error } = await client.storage.from(STORAGE_BUCKET).upload(objectPath, buffer, {
      contentType: mime,
      upsert: false,
      cacheControl: '31536000',
    });
    if (error) {
      throw new ImageValidationError(`The image could not be stored: ${error.message}`);
    }
    const { data } = client.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);
    return data.publicUrl;
  }

  const directory = path.join(UPLOAD_ROOT, folder);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_ROOT, objectPath), buffer);
  return `${UPLOAD_URL_PREFIX}/${objectPath}`;
}

/**
 * Remove a previously stored image.
 *
 * Anything that is not one of our own storage locations is ignored, so a
 * tampered database value can never delete an unrelated file — and a
 * Google-hosted avatar URL is left alone rather than being treated as ours.
 */
export async function deleteStoredImage(publicPath?: string | null): Promise<void> {
  if (!publicPath) return;

  const client = storageClient();
  if (client) {
    const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
    const index = publicPath.indexOf(marker);
    if (index !== -1) {
      const objectPath = publicPath.slice(index + marker.length).split('?')[0];
      await client.storage.from(STORAGE_BUCKET).remove([objectPath]).catch(() => {});
      return;
    }
  }

  if (!publicPath.startsWith(`${UPLOAD_URL_PREFIX}/`)) return;

  const relative = publicPath.slice(UPLOAD_URL_PREFIX.length + 1);
  const absolute = path.resolve(UPLOAD_ROOT, relative);
  // Never follow a path that escapes the upload root.
  if (!absolute.startsWith(UPLOAD_ROOT + path.sep)) return;

  await fs.rm(absolute, { force: true }).catch(() => {});
}

/**
 * Prepare storage at boot. On Supabase this verifies the bucket is reachable so
 * a misconfiguration surfaces at startup rather than on a doctor's first
 * upload; on local disk it creates the directories the static handler serves.
 */
export async function ensureUploadDirectories(): Promise<void> {
  const client = storageClient();
  if (client) {
    const { error } = await client.storage.getBucket(STORAGE_BUCKET);
    if (error) {
      console.error(`⚠️  Supabase Storage bucket "${STORAGE_BUCKET}" is not reachable: ${error.message}`);
      console.error('   Create it (public read) or uploads will fail.');
    } else {
      console.log(`✅ Image storage: Supabase bucket "${STORAGE_BUCKET}"`);
    }
    return;
  }

  await fs.mkdir(path.join(UPLOAD_ROOT, 'doctors'), { recursive: true });
  await fs.mkdir(path.join(UPLOAD_ROOT, 'avatars'), { recursive: true });
  console.log('ℹ️  Image storage: local disk (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for Supabase Storage)');
}
