/**
 * ---------------------------------------------------------------------------
 * Private storage for patient-uploaded documents
 * ---------------------------------------------------------------------------
 *
 * Deliberately separate from lib/imageStorage.ts, which returns
 * `getPublicUrl()` — a permanent, unauthenticated, guessable-by-nobody-but-
 * shareable-by-anyone link. That is the right call for a doctor's portrait and
 * completely wrong for somebody's blood test: a public URL leaked once is
 * leaked permanently, and there is no way to revoke it.
 *
 * So nothing here ever produces a public URL. The database stores an object
 * key, and a short-lived signed URL is minted only after the caller has been
 * shown to own the record.
 *
 * The local-disk fallback exists so the feature works before Supabase is
 * configured, but it writes outside the directory Express serves statically —
 * a report is never reachable over HTTP without going through the API.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Reports live in their own bucket, which must NOT be public-read. */
export const REPORT_BUCKET = process.env.SUPABASE_REPORT_BUCKET || 'medical-reports';

/**
 * Private root for the local fallback. Deliberately NOT under UPLOAD_DIR: that
 * directory is served by express.static, so putting reports there would publish
 * every one of them.
 */
export const REPORT_ROOT = process.env.REPORT_DIR
  ? path.resolve(process.env.REPORT_DIR)
  : path.join(process.cwd(), 'private-uploads', 'reports');

/** Signed links live just long enough to open the file once. */
export const SIGNED_URL_TTL_SECONDS = 120;

/** 8 MB: a phone photo of a report, or a short PDF. */
export const MAX_REPORT_BYTES = 8 * 1024 * 1024;

export class ReportValidationError extends Error {}

/**
 * What a patient may upload.
 *
 * An allowlist, not a denylist. Anything executable, archived, or of a type we
 * cannot reason about is refused rather than stored and hoped about.
 */
const ALLOWED: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'application/pdf', ext: '.pdf', test: (b) => b.length > 4 && b.toString('ascii', 0, 4) === '%PDF' },
  { mime: 'image/png', ext: '.png', test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/jpeg', ext: '.jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', ext: '.webp', test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
  {
    mime: 'text/plain',
    ext: '.txt',
    // Text has no magic number. Accept it only when the bytes really are text:
    // no NULs, and decodable as UTF-8 without replacement characters.
    test: (b) => !b.includes(0x00) && !b.toString('utf8').includes('�'),
  },
];

export interface ValidatedReport {
  buffer: Buffer;
  ext: string;
  mime: string;
}

/**
 * Validate a `data:` URL by its CONTENT, not its label.
 *
 * The declared MIME type is attacker-controlled, so it is used only to reject
 * early; what decides the stored type is the magic-byte test. A .exe renamed to
 * application/pdf fails here rather than being written to disk.
 */
export function validateReportDataUrl(dataUrl: string): ValidatedReport {
  if (typeof dataUrl !== 'string') {
    throw new ReportValidationError('The report must be sent as a base64 data URL.');
  }
  const match = /^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/s.exec(dataUrl.trim());
  if (!match) {
    throw new ReportValidationError('The report must be a base64 data URL (data:application/pdf;base64,...).');
  }

  const declared = match[1].toLowerCase();
  if (!ALLOWED.some((a) => a.mime === declared)) {
    throw new ReportValidationError('Upload a PDF, an image (PNG/JPG/WebP), or a plain-text file.');
  }

  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (buffer.length === 0) throw new ReportValidationError('That file is empty.');
  if (buffer.length > MAX_REPORT_BYTES) {
    throw new ReportValidationError(`That file is too large. Maximum size is ${Math.round(MAX_REPORT_BYTES / (1024 * 1024))} MB.`);
  }

  const signature = ALLOWED.find((a) => a.test(buffer));
  if (!signature) {
    throw new ReportValidationError('That file does not look like a PDF, image, or text file.');
  }
  // A file whose contents disagree with its label is refused outright: it is
  // either corrupt or deliberately disguised, and neither is worth storing.
  if (signature.mime !== declared) {
    throw new ReportValidationError('That file’s contents do not match its type.');
  }

  return { buffer, ext: signature.ext, mime: signature.mime };
}

let supabase: SupabaseClient | null = null;
function storageClient(): SupabaseClient | null {
  if (supabase) return supabase;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  return supabase;
}

export function reportStorageBackend(): 'supabase' | 'local-disk' {
  return storageClient() ? 'supabase' : 'local-disk';
}

/**
 * Store a validated document and return its object key.
 *
 * The key is namespaced by owner, which means a signed URL for one patient's
 * folder can never be pointed at another's by editing the path.
 */
export async function saveReport(
  dataUrl: string,
  ownerId: string,
): Promise<{ objectPath: string; mime: string; sizeBytes: number }> {
  const { buffer, ext, mime } = validateReportDataUrl(dataUrl);
  const objectPath = `${ownerId}/${randomUUID()}${ext}`;

  const client = storageClient();
  if (client) {
    const { error } = await client.storage.from(REPORT_BUCKET).upload(objectPath, buffer, {
      contentType: mime,
      upsert: false,
    });
    if (error) throw new ReportValidationError(`The report could not be stored: ${error.message}`);
    return { objectPath, mime, sizeBytes: buffer.length };
  }

  const absolute = path.join(REPORT_ROOT, objectPath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, buffer);
  return { objectPath, mime, sizeBytes: buffer.length };
}

/**
 * A time-limited link to one stored report.
 *
 * Call ONLY after confirming the caller owns the record. Nothing in this
 * function checks that — it cannot, it has no idea who is asking.
 */
export async function signedReportUrl(objectPath: string): Promise<string | null> {
  const client = storageClient();
  if (client) {
    const { data, error } = await client.storage
      .from(REPORT_BUCKET)
      .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }
  // On local disk there is nothing to sign; the API streams the bytes instead.
  return null;
}

/** Read a stored report back, for the local-disk path and for text extraction. */
export async function readReport(objectPath: string): Promise<Buffer | null> {
  const client = storageClient();
  if (client) {
    const { data, error } = await client.storage.from(REPORT_BUCKET).download(objectPath);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }

  const absolute = path.resolve(REPORT_ROOT, objectPath);
  // Never follow a path that escapes the report root.
  if (!absolute.startsWith(REPORT_ROOT + path.sep)) return null;
  return fs.readFile(absolute).catch(() => null);
}

/** Remove a stored report. Ownership is the caller's responsibility. */
export async function deleteReport(objectPath?: string | null): Promise<void> {
  if (!objectPath) return;
  const client = storageClient();
  if (client) {
    await client.storage.from(REPORT_BUCKET).remove([objectPath]).catch(() => {});
    return;
  }
  const absolute = path.resolve(REPORT_ROOT, objectPath);
  if (!absolute.startsWith(REPORT_ROOT + path.sep)) return;
  await fs.rm(absolute, { force: true }).catch(() => {});
}

/**
 * Pull readable text out of an uploaded document.
 *
 * Honest about its limits, which is the point. Plain text is read directly; a
 * PDF yields text only when it stores it uncompressed, which many do not; an
 * image yields nothing without OCR, which is not installed. When extraction
 * fails the caller gets a note explaining why, and the patient is asked to
 * describe their symptoms instead — rather than the model being handed an empty
 * string and inventing something to fill it.
 */
export function extractText(buffer: Buffer, mime: string): { text: string | null; note: string | null } {
  if (mime === 'text/plain') {
    const text = buffer.toString('utf8').trim();
    return text
      ? { text: text.slice(0, 20000), note: null }
      : { text: null, note: 'The file was empty.' };
  }

  if (mime === 'application/pdf') {
    // Uncompressed PDF text sits between BT/ET markers as parenthesised runs.
    // This deliberately does not try to be a PDF engine: it recovers text from
    // simple, text-layer PDFs and admits defeat on anything else.
    const raw = buffer.toString('latin1');
    const chunks: string[] = [];
    for (const block of raw.match(/BT[\s\S]*?ET/g) ?? []) {
      for (const piece of block.match(/\((?:\\.|[^\\)])*\)/g) ?? []) {
        const cleaned = piece
          .slice(1, -1)
          .replace(/\\([()\\])/g, '$1')
          .replace(/\\[0-7]{1,3}/g, ' ');
        if (cleaned.trim()) chunks.push(cleaned);
      }
    }
    const text = chunks.join(' ').replace(/\s+/g, ' ').trim();
    if (text.length >= 40) return { text: text.slice(0, 20000), note: null };
    return {
      text: null,
      note: 'This PDF stores its text as images or in a compressed form, so it could not be read automatically. Describe your symptoms and a doctor will review the file itself.',
    };
  }

  return {
    text: null,
    note: 'Images cannot be read automatically here — no OCR is installed. Describe your symptoms and a doctor will review the file itself.',
  };
}

/** Create the private directory used by the local-disk fallback. */
export async function ensureReportStorage(): Promise<void> {
  if (storageClient()) return;
  await fs.mkdir(REPORT_ROOT, { recursive: true }).catch(() => {});
}
