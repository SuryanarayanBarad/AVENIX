import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from './lib/db.js';
import {
  FacilityRepo,
  UserRepo,
  ServiceRepo,
  DoctorRepo,
  DepartmentRepo,
  TokenRepo,
  AppointmentRepo,
  AvailabilityRepo,
  ScheduleChangeRepo,
  NotificationRepo,
  AuditRepo,
  CameraRepo,
  CameraAnalyticsRepo,
} from './lib/repositories.js';
import {
  UPLOAD_ROOT,
  ensureUploadDirectories,
  storageBackend,
  saveDataUrlImage,
  deleteStoredImage,
  ImageValidationError,
} from './lib/imageStorage.js';
import {
  type AppointmentStatus,
  APPROVED_STATUSES,
  DENIAL_REASONS,
  QUEUE_ELIGIBLE_STATUSES,
  TERMINAL_STATUSES,
  resolveDenialReason,
  approvalRate,
  canTransition,
  isQueueEligible,
  normaliseStatus,
  toPatientStatus,
  toQueueStatus,
  toTokenStatus,
  transitionError,
} from './lib/appointmentState.js';
import {
  type Permission,
  type Role,
  hasPermission,
} from './lib/permissions.js';
import { publishEvent, subscribeToEvents } from './lib/eventBus.js';
import { startOfServiceDay, serviceDayKey, displayVisitorName } from './lib/serviceDay.js';
import { consume } from './lib/rateLimit.js';
import {
  getCachedFacility, getCachedService, getCachedServices, invalidateReferenceCache,
  getCachedUser, setCachedUser, invalidateUser,
} from './lib/referenceCache.js';


dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
/**
 * Signing key for every session token.
 *
 * The development fallback below is, by definition, public — it sits in source
 * control. Anyone holding it can mint a token for any account, including
 * SUPER_ADMIN, which walks straight past every role check in this file. So a
 * production process refuses to start on it rather than run wide open: a
 * deploy that fails loudly is recoverable, one that silently trusts a known
 * key is not.
 */
const DEV_JWT_SECRET = 'queuemind-dev-secret-change-in-production';
const JWT_SECRET = process.env.JWT_SECRET || DEV_JWT_SECRET;

if (process.env.NODE_ENV === 'production' && JWT_SECRET === DEV_JWT_SECRET) {
  console.error(
    '[fatal] JWT_SECRET is not set. Sessions would be signed with the public ' +
    'development key, letting anyone forge a SUPER_ADMIN token. Set JWT_SECRET ' +
    'to a long random value in the hosting environment and redeploy.',
  );
  process.exit(1);
}

app.disable('x-powered-by');
// Render/Cloud Run terminate TLS upstream, so the client address arrives in
// X-Forwarded-For. Without this every request looks like it comes from the
// proxy and rate limits would apply to all users collectively.
app.set('trust proxy', 1);
// Profile/doctor photos arrive as base64 data URLs on the JSON API, so the body
// cap has to clear a 4 MB image plus base64 overhead. lib/imageStorage.ts is
// what actually enforces the per-image size, type, and magic-byte checks.
app.use(express.json({ limit: '8mb' }));

// Stored profile images are served from disk — the database only holds the path.
app.use(
  '/uploads',
  express.static(UPLOAD_ROOT, {
    maxAge: '7d',
    index: false,
    dotfiles: 'deny',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'");
    },
  }),
);

// A missing image must 404 rather than fall through to the SPA/dev-server
// handler, which would answer an <img> request with an HTML page.
app.use('/uploads', (_req, res) => {
  res.status(404).json({ error: 'IMAGE_NOT_FOUND', message: 'That image does not exist.' });
});

/**
 * --------------------------------------------------------------------------
 * QueueMind AI — PostgreSQL-backed API
 * --------------------------------------------------------------------------
 *
 * All persistence is backed by PostgreSQL via Prisma ORM; domain services use
 * the repository layer in lib/repositories.ts.
 *
 * Two shared modules own cross-cutting rules, imported by the server and the
 * React app alike so the two can never disagree:
 *   - lib/permissions.ts      — who may see and do what
 *   - lib/appointmentState.ts — the appointment lifecycle and its projections
 */

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

/** Coarse staff grouping used by the legacy admin guard. */
type StaffRole = 'staff' | 'manager';

/** Availability a doctor can be marked with for a given day. */
type DoctorStatus = 'Available' | 'Busy' | 'Delayed' | 'Unavailable';

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------

class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const apiRoute = (handler: (req: express.Request, res: express.Response) => any | Promise<any>) =>
  async (req: express.Request, res: express.Response) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof ApiError) {
        return res.status(error.statusCode).json({
          error: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        });
      }

      console.error('Queue and appointment API error:', error);
      return res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'The request could not be completed.',
      });
    }
  };

// ---------------------------------------------------------------------------
// Audit & Events (now PostgreSQL-backed)
// ---------------------------------------------------------------------------

async function recordAudit(
  actor: { id: string; role: string },
  action: string,
  targetType: string,
  targetId: string,
  outcome: string = 'success',
) {
  try {
    await AuditRepo.record({
      actorId: actor.id,
      actorRole: actor.role,
      action,
      targetType,
      targetId,
      outcome,
    });
  } catch (err) {
    // Audit logging should never crash the request
    console.error('Audit logging error:', err);
  }
}

// ---------------------------------------------------------------------------
// Validation Helpers (unchanged)
// ---------------------------------------------------------------------------

function bodyAsObject(req: express.Request): Record<string, unknown> {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    throw new ApiError(400, 'INVALID_REQUEST', 'A JSON object request body is required.');
  }
  return req.body as Record<string, unknown>;
}

function requiredString(value: unknown, label: string, maxLength = 250): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${label} is required.`, { field: label });
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${label} is too long.`, { field: label, maxLength });
  }
  return trimmed;
}

function optionalString(value: unknown, label: string, maxLength = 250): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requiredString(value, label, maxLength);
}

function validatedPhone(value: unknown, required: boolean): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ApiError(400, 'VALIDATION_ERROR', 'Phone number is required.', { field: 'phone' });
    return undefined;
  }
  const phone = requiredString(value, 'phone number', 30);
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Enter a valid phone number.', { field: 'phone' });
  }
  return phone;
}

function validatedDate(value: unknown): string {
  const date = requiredString(value, 'Appointment date', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Use YYYY-MM-DD for the appointment date.', { field: 'date' });
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Enter a valid appointment date.', { field: 'date' });
  }
  return date;
}

function normaliseTime(value: unknown, label = 'Appointment time'): string {
  const input = requiredString(value, label, 20);
  const twentyFourHour = input.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (twentyFourHour) return `${twentyFourHour[1]}:${twentyFourHour[2]}`;

  const twelveHour = input.match(/^(1[0-2]|0?[1-9]):([0-5]\d)\s*([AaPp][Mm])$/);
  if (!twelveHour) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Use a valid appointment time.', { field: 'time' });
  }
  const isPm = twelveHour[3].toLowerCase() === 'pm';
  const hour = (Number(twelveHour[1]) % 12) + (isPm ? 12 : 0);
  return `${String(hour).padStart(2, '0')}:${twelveHour[2]}`;
}

function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function formatTime(time: string): string {
  const [hourText, minute] = time.split(':');
  const hour = Number(hourText);
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function timeIsWithin(time: string, start: string, end: string): boolean {
  const minute = timeToMinutes(time);
  return minute >= timeToMinutes(start) && minute < timeToMinutes(end);
}

function hashAccessKey(accessKey: string): string {
  return createHash('sha256').update(accessKey).digest('hex');
}

function generateAccessKey(): string {
  return randomBytes(24).toString('base64url');
}

function accessKeyMatches(accessKey: string | undefined, storedHash: string): boolean {
  if (!accessKey) return false;
  const candidate = Buffer.from(hashAccessKey(accessKey), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

function accessKeyFromRequest(req: express.Request): string | undefined {
  const queryValue = req.query.accessKey;
  if (typeof queryValue === 'string' && queryValue) return queryValue;
  const headerValue = req.header('x-visitor-access-key');
  return headerValue || undefined;
}

function requireVisitorAccess(req: express.Request, accessKeyHash: string, targetType: 'token' | 'appointment', targetId: string): void {
  if (!accessKeyMatches(accessKeyFromRequest(req), accessKeyHash)) {
    recordAudit({ id: 'visitor', role: 'visitor-capability' }, 'visitor_access', targetType, targetId, 'denied');
    throw new ApiError(403, 'VISITOR_ACCESS_DENIED', 'A valid private access key is required.');
  }
}

/**
 * Staff who operate the queue may read any token on it.
 *
 * Ownership checks previously admitted only the token's owner or somebody
 * holding its private access key, so an admin clicking a row on the live board
 * — a board built for them, listing that exact token — was told "a valid
 * private access key is required". The role is read from the database, never
 * from the JWT claim, so a stale token cannot grant this.
 */
async function callerRunsTheQueue(req: express.Request): Promise<boolean> {
  const authHeader = req.header('authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as { userId: string };
    // getCachedUser is a cache probe, not a loader: it returns undefined on a
    // miss, which is the normal case. Read through to the database, exactly as
    // the other role checks do, or a cold cache silently denies every admin.
    let user: any = getCachedUser(payload.userId);
    if (user === undefined) {
      user = await prisma.user.findFirst({
        where: { id: payload.userId, deletedAt: null },
        include: { doctor: { select: { id: true } } },
      });
      setCachedUser(payload.userId, user);
    }
    return !!user && hasPermission(user.role, 'queue:read');
  } catch {
    return false;
  }
}

function maskPhone(phone: string | null | undefined): string | null {
  // A desk booking may have no number at all. Returning null lets callers show
  // "no contact on file" rather than a row of meaningless dots.
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return `••••••${digits.slice(-4)}`;
}

function standardSlots(): string[] {
  const slots: string[] = [];
  for (let minutes = 9 * 60; minutes < 17 * 60; minutes += 30) {
    slots.push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
  }
  return slots;
}

function parseDateQuery(req: express.Request): string {
  const date = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
  return validatedDate(date);
}

// ---------------------------------------------------------------------------
// Auth Middleware (JWT-based, replaces X-QueueMind-Role mock)
// ---------------------------------------------------------------------------

/**
 * requireAdmin verifies admin/staff access. It checks:
 * 1. JWT Bearer token (production path)
 * 2. X-QueueMind-Role header (backward-compatible mock path for existing frontend)
 *
 * This dual approach preserves backward compatibility while the frontend
 * auth integration is completed.
 */
async function requireAdmin(req: express.Request, res: express.Response): Promise<{ id: string; role: StaffRole } | null> {
  // Path 1: JWT Bearer token
  const authHeader = req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };

      let user: any = getCachedUser(payload.userId);
      if (user === undefined) {
        user = await prisma.user.findFirst({
          where: { id: payload.userId, deletedAt: null },
          include: { doctor: { select: { id: true } } },
        });
        setCachedUser(payload.userId, user);
      }
      if (!user) {
        res.status(401).json({ error: 'AUTHENTICATION_REQUIRED', message: 'User not found.' });
        return null;
      }

      const role = user.role;
      // DOCTOR is deliberately excluded: a doctor is scoped to their own
      // patients through /api/doctor/*, never to facility-wide admin data.
      const validRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF'];

      if (!validRoles.includes(role)) {
        res.status(403).json({
          error: 'AUTHORIZATION_DENIED',
          message: 'Only staff and managers can access this resource.',
        });
        return null;
      }
      const staffRole: StaffRole = role === 'STAFF' ? 'staff' : 'manager';
      return { id: payload.userId, role: staffRole };
    } catch {
      res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Invalid or expired token.',
      });
      return null;
    }
  }

  // Path 2: Legacy X-QueueMind-Role header. This is a self-asserted role with
  // no verification, so it stays off unless ALLOW_LEGACY_ROLE_HEADER=true is set
  // explicitly (local demos only — never in production).
  if (process.env.ALLOW_LEGACY_ROLE_HEADER !== 'true') {
    res.status(401).json({
      error: 'AUTHENTICATION_REQUIRED',
      message: 'Sign in with a staff, manager, or administrator account to view this resource.',
    });
    return null;
  }

  const rawRole = req.header('x-queuemind-role')?.trim().toLowerCase();
  if (!rawRole) {
    res.status(401).json({
      error: 'AUTHENTICATION_REQUIRED',
      message: 'Staff or manager access is required.',
    });
    return null;
  }
  if (rawRole !== 'staff' && rawRole !== 'manager') {
    res.status(403).json({
      error: 'AUTHORIZATION_DENIED',
      message: 'Only staff and managers can access this resource.',
    });
    return null;
  }
  return {
    id: req.header('x-queuemind-user-id')?.trim() || `mock-${rawRole}`,
    role: rawRole,
  };
}

async function requireSuperAdmin(req: express.Request, res: express.Response): Promise<{ id: string } | null> {
  const authHeader = req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };

      let user: any = getCachedUser(payload.userId);
      if (user === undefined) {
        user = await prisma.user.findFirst({
          where: { id: payload.userId, deletedAt: null },
          include: { doctor: { select: { id: true } } },
        });
        setCachedUser(payload.userId, user);
      }

      if (!user) {
        res.status(401).json({
          error: 'AUTHENTICATION_REQUIRED',
          message: 'User no longer exists.',
        });
        return null;
      }

      if (user.role !== 'SUPER_ADMIN') {
        res.status(403).json({
          error: 'AUTHORIZATION_DENIED',
          message: 'Only super administrators can access this resource.',
        });
        return null;
      }
      return { id: payload.userId };
    } catch {
      res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Invalid or expired token.',
      });
      return null;
    }
  }

  res.status(401).json({
    error: 'AUTHENTICATION_REQUIRED',
    message: 'Super admin access is required.',
  });
  return null;
}

async function requireDoctor(req: express.Request, res: express.Response): Promise<{ userId: string; doctorId: string } | null> {
  const authHeader = req.header('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'AUTHENTICATION_REQUIRED',
      message: 'Doctor access is required.',
    });
    return null;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { doctor: true },
    });

    if (!user) {
      res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'User not found.',
      });
      return null;
    }

    // Two different failures used to share one message. "Only doctors can
    // access this resource" is accurate for the wrong role, but actively
    // misleading for a DOCTOR whose profile has not been created yet — that
    // reads as a permissions bug when it is a setup step nobody was told about.
    if (user.role !== 'DOCTOR') {
      res.status(403).json({
        error: 'AUTHORIZATION_DENIED',
        message: `This area is for doctors. Your account is signed in as ${user.role}.`,
      });
      return null;
    }

    if (!user.doctor) {
      res.status(403).json({
        error: 'DOCTOR_PROFILE_MISSING',
        message:
          'Your account has the doctor role, but no doctor profile has been created for it yet. ' +
          'Ask a super admin to open Doctors and add your profile — everything here works as soon as it exists.',
      });
      return null;
    }

    return { userId: user.id, doctorId: user.doctor.id };
  } catch (err) {
    console.error("requireDoctor error:", err);
    res.status(401).json({
      error: 'AUTHENTICATION_REQUIRED',
      message: 'Invalid or expired token.',
    });
    return null;
  }
}

/**
 * Guard a public write endpoint against flooding.
 *
 * Keyed by client address so one shared kiosk is treated as one source. The
 * allowance is deliberately loose: it exists to stop a script filling the queue
 * with junk, not to ration real patients.
 */
function enforceRateLimit(
  req: express.Request,
  res: express.Response,
  scope: string,
  limit: number,
  windowMs: number,
): boolean {
  const forwarded = req.header('x-forwarded-for');
  const address = (forwarded ? forwarded.split(',')[0] : req.ip || req.socket.remoteAddress || 'unknown').trim();

  const result = consume(`${scope}:${address}`, limit, windowMs);
  if (!result.allowed) {
    res.setHeader('Retry-After', String(result.retryAfter));
    res.status(429).json({
      error: 'TOO_MANY_REQUESTS',
      message: `That is a lot of requests at once. Please wait ${result.retryAfter}s and try again, or ask a staff member for help.`,
    });
    return false;
  }
  return true;
}

/**
 * requireAuthUser resolves the signed-in account for self-service routes
 * (profile read/write). Every identity fact comes from the verified JWT —
 * never from the request body or query string.
 */
async function requireAuthUser(req: express.Request, res: express.Response) {
  const authHeader = req.header('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'AUTHENTICATION_REQUIRED', message: 'Sign in to continue.' });
    return null;
  }

  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as { userId: string };

    // The signature is verified above; the ROLE still comes from the row, just
    // possibly a very recently cached copy. Every role write invalidates it.
    let user: any = getCachedUser(payload.userId);
    if (user === undefined) {
      user = await prisma.user.findFirst({
        where: { id: payload.userId, deletedAt: null },
        include: { doctor: { select: { id: true } } },
      });
      setCachedUser(payload.userId, user);
    }

    if (!user) {
      res.status(401).json({ error: 'AUTHENTICATION_REQUIRED', message: 'User not found.' });
      return null;
    }
    return user;
  } catch {
    res.status(401).json({ error: 'AUTHENTICATION_REQUIRED', message: 'Invalid or expired token.' });
    return null;
  }
}

/**
 * Read access to the doctor directory for management screens.
 * SUPER_ADMIN manages; ADMIN/MANAGER may only look.
 */
async function requireDoctorDirectoryViewer(req: express.Request, res: express.Response) {
  const user = await requireAuthUser(req, res);
  if (!user) return null;

  if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role)) {
    res.status(403).json({
      error: 'AUTHORIZATION_DENIED',
      message: 'You do not have permission to view doctor management data.',
    });
    return null;
  }
  return user;
}

/** Shape returned to any client for the signed-in account. Never includes secrets. */
function publicUserView(user: { id: string; name: string; email: string; role: string; avatarUrl?: string | null; phone?: string | null }, doctorId?: string | null) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatarUrl ?? null,
    phone: user.phone ?? null,
    ...(doctorId ? { doctorId } : {}),
  };
}

/** Store an uploaded data-URL image, translating validation failures into ApiError. */
async function storeUploadedImage(dataUrl: unknown, folder: 'doctors' | 'avatars'): Promise<string> {
  try {
    return await saveDataUrlImage(String(dataUrl), folder);
  } catch (error) {
    if (error instanceof ImageValidationError) {
      throw new ApiError(400, 'INVALID_IMAGE', error.message, { field: 'photo' });
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Lookup helpers (now async, PostgreSQL-backed)
// ---------------------------------------------------------------------------

/** Cached facility, or a clear error when the database has not been bootstrapped. */
async function getCachedFacilityOrThrow() {
  const facility = await getCachedFacility();
  if (!facility) {
    throw new ApiError(503, 'FACILITY_NOT_CONFIGURED', 'No facility has been set up yet. Run the bootstrap script.');
  }
  return facility;
}

async function findService(serviceId: string) {
  // Served from the reference cache: this is called several times per token and
  // once per row on the queue board, and services almost never change.
  const service = await getCachedService(serviceId);
  if (!service) throw new ApiError(400, 'UNKNOWN_SERVICE', 'Select an available service.', { field: 'serviceId' });
  return service;
}

async function findDoctor(doctorId: string) {
  const doctor = await DoctorRepo.findById(doctorId);
  if (!doctor) throw new ApiError(404, 'DOCTOR_NOT_FOUND', 'The selected doctor was not found.');
  return doctor;
}

async function getTokenOrThrow(tokenId: string) {
  const token = await TokenRepo.findById(tokenId);
  if (!token) throw new ApiError(404, 'TOKEN_NOT_FOUND', 'The token was not found.');
  return token;
}

async function getAppointmentOrThrow(appointmentId: string) {
  const appointment = await AppointmentRepo.findById(appointmentId);
  if (!appointment) throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', 'The appointment was not found.');
  return appointment;
}

/**
 * How many people are genuinely ahead of this token, and the wait that implies.
 *
 * This used to be `service.peopleWaiting + activeCount - 1`, which was neither
 * positional (every token in a service reported the same number) nor real (it
 * was padded by a seeded demo figure). It now counts the tokens actually issued
 * before this one — the same TokenRepo.countAheadOf every other screen uses, so
 * the visitor's card, the queue view and the Command Center cannot disagree.
 */
/**
 * Position of every token within its own service queue, computed in one pass.
 * Only Waiting/Approaching tokens hold a place, matching TokenRepo.countAheadOf.
 */
function computeAheadCounts(tokens: { id: string; serviceId: string; status: string; issuedAt: Date | string }[]) {
  const byService = new Map<string, { id: string; at: number }[]>();

  for (const token of tokens) {
    if (!['Waiting', 'Approaching'].includes(token.status)) continue;
    const at = token.issuedAt instanceof Date ? token.issuedAt.getTime() : new Date(token.issuedAt).getTime();
    const bucket = byService.get(token.serviceId) ?? [];
    bucket.push({ id: token.id, at });
    byService.set(token.serviceId, bucket);
  }

  const ahead = new Map<string, number>();
  for (const bucket of byService.values()) {
    bucket.sort((a, b) => a.at - b.at);
    bucket.forEach((entry, index) => ahead.set(entry.id, index));
  }
  return ahead;
}

async function tokenMetrics(token: { serviceId: string; facilityId: string; issuedAt: Date | string }) {
  const service = await findService(token.serviceId);
  const peopleAhead = await TokenRepo.countAheadOf(token);
  return {
    peopleAhead,
    estimatedWaitMinutes: Math.max(service.estimatedWaitMinutes, Math.ceil(peopleAhead * 1.7)),
  };
}

async function toPublicToken(token: { id: string; code: string; serviceId: string; facilityId: string; status: string; counterName: string | null; issuedAt: Date | string }) {
  const service = await findService(token.serviceId);
  const metrics = await tokenMetrics(token);
  return {
    id: token.id,
    code: token.code,
    serviceName: service.name,
    peopleAhead: metrics.peopleAhead,
    estimatedWaitMinutes: metrics.estimatedWaitMinutes,
    status: token.status,
    // Falls back to the service's desk so a visitor is always told where to go.
    counterName: token.counterName ?? service.defaultCounterName ?? null,
    issuedAt: token.issuedAt instanceof Date ? token.issuedAt.toISOString() : token.issuedAt,
  };
}

async function toVisitorAppointment(appointment: { id: string; code: string; doctorId: string; date: string; time: string; patientName: string; phone: string; status: string }) {
  const doctor = await findDoctor(appointment.doctorId);
  return {
    id: appointment.id,
    appointmentId: appointment.code,
    code: appointment.code,
    doctor: `Dr. ${doctor.name}`,
    doctorId: doctor.id,
    department: doctor.department.name,
    date: appointment.date,
    time: formatTime(appointment.time),
    patientName: appointment.patientName,
    maskedPhone: maskPhone(appointment.phone),
    // Raw lifecycle state plus the shared patient-facing wording. Both come
    // from the same source, so this can never disagree with the staff view.
    status: toPatientStatus(appointment.status),
    lifecycleStatus: appointment.status,
    awaitingApproval: appointment.status === 'Pending',
    statusReason: (appointment as any).statusReason ?? null,
  };
}

async function toStaffAppointment(appointment: { id: string; code: string; doctorId: string; date: string; time: string; patientName: string; phone: string; status: string; reasonForVisit: string; existingDiagnosis: string | null; createdAt: Date | string; updatedAt: Date | string; version: number }) {
  const visitorView = await toVisitorAppointment(appointment);
  return {
    ...visitorView,
    // Staff see the lifecycle state itself; `version` lets their client detect
    // a conflicting edit before it writes.
    status: appointment.status,
    // 24h value alongside the display string, for slot/conflict maths.
    rawTime: appointment.time,
    patientStatus: visitorView.status,
    queueStatus: toQueueStatus(appointment.status),
    phone: appointment.phone,
    reasonForVisit: appointment.reasonForVisit,
    existingDiagnosis: appointment.existingDiagnosis,
    createdAt: appointment.createdAt instanceof Date ? appointment.createdAt.toISOString() : appointment.createdAt,
    updatedAt: appointment.updatedAt instanceof Date ? appointment.updatedAt.toISOString() : appointment.updatedAt,
    version: appointment.version,
  };
}

function activeAppointment(appointment: { status: string }): boolean {
  return appointment.status !== 'Completed' && appointment.status !== 'Cancelled';
}

async function doctorAvailabilityForDate(doctorId: string, date: string) {
  return AvailabilityRepo.findByDoctorAndDate(doctorId, date);
}

/** Doctor status from availability rows already in hand — no query. */
function deriveDoctorStatus(records: { status: string }[]): DoctorStatus {
  const statuses = records.map((item) => item.status);
  if (statuses.includes('Unavailable')) return 'Unavailable';
  if (statuses.includes('Delayed')) return 'Delayed';
  if (statuses.includes('Busy')) return 'Busy';
  return 'Available';
}

/**
 * Staff appointment DTO built from an appointment plus its already-loaded
 * doctor. The async version re-reads the doctor for every appointment, which is
 * fine for a single row but ruinous inside a listing.
 */
function toStaffAppointmentWith(
  appointment: { id: string; code: string; doctorId: string; date: string; time: string; patientName: string; phone: string; status: string; statusReason?: string | null; reasonForVisit: string; existingDiagnosis: string | null; createdAt: Date | string; updatedAt: Date | string; version: number },
  doctor: { id: string; name: string; department: { name: string } },
) {
  return {
    id: appointment.id,
    appointmentId: appointment.code,
    code: appointment.code,
    doctor: `Dr. ${doctor.name}`,
    doctorId: doctor.id,
    department: doctor.department.name,
    date: appointment.date,
    time: formatTime(appointment.time),
    rawTime: appointment.time,
    patientName: appointment.patientName,
    maskedPhone: maskPhone(appointment.phone),
    phone: appointment.phone,
    status: appointment.status,
    patientStatus: toPatientStatus(appointment.status),
    queueStatus: toQueueStatus(appointment.status),
    statusReason: appointment.statusReason ?? null,
    awaitingApproval: appointment.status === 'Pending',
    reasonForVisit: appointment.reasonForVisit,
    existingDiagnosis: appointment.existingDiagnosis,
    createdAt: appointment.createdAt instanceof Date ? appointment.createdAt.toISOString() : appointment.createdAt,
    updatedAt: appointment.updatedAt instanceof Date ? appointment.updatedAt.toISOString() : appointment.updatedAt,
    version: appointment.version,
  };
}

async function doctorStatusForDate(doctorId: string, date: string): Promise<DoctorStatus> {
  const records = await doctorAvailabilityForDate(doctorId, date);
  const statuses = records.map((item) => item.status);
  if (statuses.includes('Unavailable')) return 'Unavailable';
  if (statuses.includes('Delayed')) return 'Delayed';
  if (statuses.includes('Busy')) return 'Busy';
  return 'Available';
}

async function isDoctorUnavailableAt(doctorId: string, date: string, time: string): Promise<boolean> {
  const records = await doctorAvailabilityForDate(doctorId, date);
  return records.some(
    (item) => item.status === 'Unavailable' && timeIsWithin(time, item.startTime, item.endTime),
  );
}

async function availableTimesForDoctor(doctorId: string, date: string, excludeAppointmentId?: string): Promise<string[]> {
  const allSlots = standardSlots();
  const result: string[] = [];
  for (const time of allSlots) {
    const unavailable = await isDoctorUnavailableAt(doctorId, date, time);
    if (unavailable) continue;
    const occupied = await AppointmentRepo.isSlotOccupied(doctorId, date, time, excludeAppointmentId);
    if (occupied) continue;
    result.push(time);
  }
  return result;
}

async function assertBookableSlot(doctorId: string, date: string, time: string, excludeAppointmentId?: string): Promise<void> {
  await findDoctor(doctorId);
  if (!standardSlots().includes(time)) {
    throw new ApiError(400, 'INVALID_APPOINTMENT_TIME', 'Select an available 30-minute appointment time.', { field: 'time' });
  }
  if (await isDoctorUnavailableAt(doctorId, date, time)) {
    throw new ApiError(409, 'APPOINTMENT_SLOT_UNAVAILABLE', 'The doctor is unavailable at the requested time.', {
      doctorId,
      date,
      time: formatTime(time),
    });
  }
  const occupied = await AppointmentRepo.isSlotOccupied(doctorId, date, time, excludeAppointmentId);
  if (occupied) {
    throw new ApiError(409, 'APPOINTMENT_SLOT_UNAVAILABLE', 'That doctor already has an appointment at the requested time.', {
      doctorId,
      date,
      time: formatTime(time),
    });
  }
}

// ---------------------------------------------------------------------------
// Notification Dispatcher (mock — same as before)
// ---------------------------------------------------------------------------

interface NotificationDispatchResult {
  status: 'mock-dispatched';
  dispatchedAt: string;
}

function dispatchNotification(): NotificationDispatchResult {
  return { status: 'mock-dispatched', dispatchedAt: new Date().toISOString() };
}

async function createNotification(
  appointment: {
    id: string; doctorId: string; phone: string | null; code: string;
    // Optional so existing callers are unaffected; used only to make the
    // doctor's notice say who moved and to when.
    patientName?: string; date?: string;
  },
  previousTime: string,
  newTime: string,
) {
  const doctor = await findDoctor(appointment.doctorId);

  let deliveryStatus: 'queued' | 'mock_dispatched' | 'failed' = 'queued';
  let dispatchedAt: Date | undefined;

  // The record is still written so staff can see the change was made; only the
  // dispatch is skipped when there is nobody to send it to.
  if (!appointment.phone) {
    console.log(`ℹ️  ${appointment.code} has no phone on file (desk booking); notification recorded, not dispatched.`);
  } else {
    try {
      const delivery = dispatchNotification();
      deliveryStatus = 'mock_dispatched';
      dispatchedAt = new Date(delivery.dispatchedAt);
    } catch (error) {
      console.error('Mock notification dispatch error:', error);
      deliveryStatus = 'failed';
    }
  }

  const notification = await NotificationRepo.create({
    appointmentId: appointment.id,
    type: 'appointment_rescheduled',
    title: 'APPOINTMENT UPDATED',
    message: `Your appointment with Dr. ${doctor.name} has been rescheduled from ${formatTime(previousTime)} to ${formatTime(newTime)}.`,
    previousTime: formatTime(previousTime),
    newTime: formatTime(newTime),
    deliveryStatus,
    recipientPhoneMasked: maskPhone(appointment.phone),
    dispatchedAt,
  });

  // The doctor is the other party to this change and was never told about it.
  // Their queue, their day, their patient — a reschedule that only reaches the
  // patient leaves the doctor working from a stale schedule.
  await notifyDoctorOfReschedule(appointment, doctor, previousTime, newTime);

  return notification;
}

/**
 * Tell the doctor their schedule moved.
 *
 * Push if they have subscribed, email if an address is on file, and a console
 * line either way so the change is traceable when neither is configured.
 * Never throws: a failed notice must not roll back a completed reschedule.
 */
async function notifyDoctorOfReschedule(
  appointment: { id: string; code: string; date?: string; patientName?: string; time?: string },
  doctor: { id: string; name: string; userId?: string | null },
  previousTime: string,
  newTime: string,
): Promise<void> {
  try {
    if (!doctor.userId) {
      console.log(`\u2139\uFE0F  Dr. ${doctor.name} has no linked login; reschedule notice not delivered for ${appointment.code}.`);
      return;
    }

    const account = await prisma.user.findFirst({
      where: { id: doctor.userId, deletedAt: null },
      select: { email: true },
    });

    const detail = {
      patientName: appointment.patientName ?? 'A patient',
      date: appointment.date ?? serviceDayKey(),
      previousTime,
      newTime,
      code: appointment.code,
    };

    const { pushService } = await import('./lib/pushService.js');
    await pushService.sendToUser(
      doctor.userId,
      'Schedule changed',
      `${detail.patientName} (${appointment.code}) moved to ${formatTime(newTime)}.`,
      { appointmentId: appointment.id },
    ).catch(() => undefined);

    if (account?.email) {
      const { emailService } = await import('./lib/emailService.js');
      await emailService.notifyDoctorRescheduled(account.email, doctor.name, detail).catch(() => undefined);
    }
  } catch (error) {
    // A failed notice must never roll back a reschedule that already happened.
    console.error('Failed to notify doctor of reschedule:', error);
  }
}

function notificationPublicView(notification: { id: string; type: string; title: string; message: string; previousTime: string; newTime: string; deliveryStatus: string; createdAt: Date | string; response: string | null }) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    previousTime: notification.previousTime,
    newTime: notification.newTime,
    deliveryStatus: notification.deliveryStatus === 'mock_dispatched' ? 'mock-dispatched' : notification.deliveryStatus,
    createdAt: notification.createdAt instanceof Date ? notification.createdAt.toISOString() : notification.createdAt,
    response: notification.response,
  };
}

function toScheduleAppointment(appointment: { id: string; code: string; patientName: string; time: string; status: string }) {
  return {
    id: appointment.id,
    appointmentId: appointment.code,
    patientName: appointment.patientName,
    time: formatTime(appointment.time),
    status: appointment.status,
  };
}

async function findNextRecommendedSlot(
  doctorId: string,
  date: string,
  startAt: string,
  reservedKeys: Set<string>,
): Promise<string | null> {
  const allSlots = standardSlots();
  for (const time of allSlots) {
    if (timeToMinutes(time) < timeToMinutes(startAt)) continue;
    if (await isDoctorUnavailableAt(doctorId, date, time)) continue;
    if (await AppointmentRepo.isSlotOccupied(doctorId, date, time)) continue;
    if (reservedKeys.has(`${doctorId}:${date}:${time}`)) continue;
    return time;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Initialize Gemini Client
// ---------------------------------------------------------------------------

const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

/**
 * Newest Flash model available on this key, confirmed against the models list
 * rather than assumed. Flash over Pro on purpose: the copilot summarises a
 * small factual snapshot, which is exactly what Flash is fast and cheap at.
 */
const COPILOT_MODEL = 'gemini-3.7-flash';
/** Used only when the primary is momentarily overloaded (503 UNAVAILABLE). */
const COPILOT_FALLBACK_MODEL = 'gemini-3.6-flash';

if (apiKey) {
  ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * QueueMind Copilot
 * ---------------------------------------------------------------------------
 * The instruction used to carry a fabricated hospital in its own text: 147
 * waiting patients, eight counters, 42 LiDAR nodes, a fairness score of 94.
 * None of it came from the database, so the assistant answered confidently
 * about a hospital that did not exist while the real queue held five tokens.
 * The client then layered mock counters and zones on top of that.
 *
 * Now the server builds its own snapshot from live tables and the model is told
 * to use nothing else. That is also what makes it cheap: a compact factual
 * snapshot costs a fraction of the invented prose it replaces, so replies are
 * both true and faster.
 */
const COPILOT_SYSTEM_INSTRUCTION = `You are QueueMind Copilot, the queue assistant for a hospital's operations team.

Answer ONLY from the SNAPSHOT provided with each question. It is the live state of this hospital.
If the snapshot does not contain what is needed, say so plainly and name what is missing. Never invent counters, sensors, patient counts, wait times, or scores.

Style:
- Lead with the direct answer in one sentence.
- Then at most three short bullets of supporting numbers, drawn from the snapshot.
- If action is warranted, end with one line starting "Do this:" naming a single concrete step.
- Use plain markdown. No headings. Under 120 words.
- If the queue is empty or quiet, say that instead of manufacturing a problem.`;

/** How many recent turns to send. Older context is rarely worth its tokens. */
const COPILOT_HISTORY_TURNS = 4;

/**
 * A compact, factual snapshot of the facility right now.
 *
 * Deliberately terse: every field is one the assistant can be asked about, and
 * nothing is included that it cannot act on. Held briefly so a burst of
 * questions does not re-query the database for each one.
 */
let copilotSnapshotCache: { at: number; value: any } | null = null;
const COPILOT_SNAPSHOT_TTL_MS = 10_000;

async function buildCopilotSnapshot() {
  if (copilotSnapshotCache && Date.now() - copilotSnapshotCache.at < COPILOT_SNAPSHOT_TTL_MS) {
    return copilotSnapshotCache.value;
  }

  const facility = await getCachedFacility();
  if (!facility) return { error: 'No facility configured.' };

  const today = serviceDayKey();
  const [tokens, services, appointments, doctors] = await Promise.all([
    TokenRepo.findAllActiveForFacility(facility.id),
    getCachedServices(facility.id),
    prisma.appointment.findMany({
      where: { facilityId: facility.id, date: today, deletedAt: null },
      select: { status: true, doctorId: true },
    }),
    prisma.doctor.findMany({
      where: { facilityId: facility.id, isActive: true },
      select: { id: true, name: true, department: { select: { name: true } } },
    }),
  ]);

  const aheadByToken = computeAheadCounts(tokens as any);
  const waits = tokens
    .filter((t: any) => t.status === 'Waiting')
    .map((t: any) => (aheadByToken.get(t.id) ?? 0) * 1.7);

  // Per service, only where somebody is actually queueing.
  const byService = services
    .map((svc: any) => {
      const queued = tokens.filter((t: any) => t.serviceId === svc.id && t.status === 'Waiting').length;
      const serving = tokens.filter((t: any) => t.serviceId === svc.id && t.status === 'Serving').length;
      return { service: svc.name, counter: svc.defaultCounterName ?? null, waiting: queued, serving };
    })
    .filter((row: any) => row.waiting > 0 || row.serving > 0);

  const apptByStatus: Record<string, number> = {};
  for (const a of appointments) apptByStatus[a.status] = (apptByStatus[a.status] || 0) + 1;

  const value = {
    facility: facility.name,
    serviceDay: today,
    queue: {
      waiting: tokens.filter((t: any) => t.status === 'Waiting').length,
      serving: tokens.filter((t: any) => t.status === 'Serving').length,
      longestWaitMin: waits.length ? Math.round(Math.max(...waits)) : 0,
      byService,
    },
    appointmentsToday: { total: appointments.length, ...apptByStatus },
    // Capped: the roster is context, not the subject. A long list is tokens
    // spent on names the question did not mention.
    doctorCount: doctors.length,
    doctors: doctors.slice(0, 12).map((d) => ({ name: d.name, department: d.department?.name ?? null })),
  };

  copilotSnapshotCache = { at: Date.now(), value };
  return value;
}

/**
 * Follow-up questions worth asking, chosen from what the snapshot actually
 * shows. The previous three were hardcoded and identical on every reply, so
 * they suggested reassigning a counter that does not exist.
 */
function copilotSuggestions(snapshot: any): string[] {
  const out: string[] = [];
  const q = snapshot?.queue;
  if (!q) return ['What is the current queue status?'];

  if (q.waiting === 0 && q.serving === 0) {
    return ['Is anything waiting right now?', 'What is booked for today?', 'Which doctors are on today?'];
  }
  const busiest = [...(q.byService ?? [])].sort((a: any, b: any) => b.waiting - a.waiting)[0];
  if (busiest && busiest.waiting > 0) out.push(`Why is ${busiest.service} the longest queue?`);
  if (q.longestWaitMin >= 15) out.push('Who has been waiting longest, and what should I do?');
  if (snapshot.appointmentsToday?.Pending) out.push(`Which ${snapshot.appointmentsToday.Pending} appointments still need approval?`);
  out.push('Summarise the queue right now');
  return out.slice(0, 3);
}

// API endpoint for QueueMind Copilot Chat
app.post('/api/copilot/chat', apiRoute(async (req, res) => {
  // The snapshot is facility-wide operational data, so this is staff-only.
  // It was previously open to anyone who could reach the URL.
  const user = await requireAuthUser(req, res);
  if (!user) return;
  if (!hasPermission(user.role, 'queue:read')) {
    res.status(403).json({
      error: 'AUTHORIZATION_DENIED',
      message: 'The copilot reports on facility operations and is available to staff.',
    });
    return;
  }
  if (!enforceRateLimit(req, res, 'copilot', 20, 60_000)) return;

  const body = bodyAsObject(req);
  const prompt = requiredString(body.prompt ?? body.message, 'Question', 500);

  const snapshot = await buildCopilotSnapshot();
  const suggestions = copilotSuggestions(snapshot);

  if (!ai) {
    res.json({
      reply: 'The assistant is not configured on this server (no GEMINI_API_KEY), so I cannot answer questions. The live figures are in the panels behind this drawer.',
      snapshot,
      suggestions,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    const history = Array.isArray(body.history)
      ? body.history.slice(-COPILOT_HISTORY_TURNS * 2)
      : [];

    const contents = [
      ...history,
      { role: 'user', parts: [{ text: `SNAPSHOT:\n${JSON.stringify(snapshot)}\n\nQUESTION: ${prompt}` }] },
    ];
    const config = {
      systemInstruction: COPILOT_SYSTEM_INSTRUCTION,
      // Low temperature: this reports on operational data, where a confident
      // invention is worse than a dull fact.
      temperature: 0.2,
      maxOutputTokens: 400,
    };

    let response;
    let modelUsed = COPILOT_MODEL;
    try {
      response = await ai.models.generateContent({ model: COPILOT_MODEL, contents, config });
    } catch (primaryError: any) {
      // Two upstream conditions are worth a second attempt, and both are about
      // the model rather than the question:
      //   503 UNAVAILABLE     — that model is momentarily busy
      //   429 RESOURCE_EXHAUSTED — the free tier allows only 20 requests per
      //     day PER MODEL, so a different model has its own untouched budget
      // Either way the previous generation answers the same question from the
      // same snapshot, which beats showing the user a failure.
      const message = primaryError?.message ?? String(primaryError);
      const retryable = /503|UNAVAILABLE|high demand|overloaded|429|RESOURCE_EXHAUSTED|quota/i.test(message);
      if (!retryable) throw primaryError;
      console.warn(`Copilot: ${COPILOT_MODEL} busy, retrying on ${COPILOT_FALLBACK_MODEL}`);
      response = await ai.models.generateContent({ model: COPILOT_FALLBACK_MODEL, contents, config });
      modelUsed = COPILOT_FALLBACK_MODEL;
    }

    res.json({
      reply: response.text?.trim() || 'I could not produce an answer for that.',
      // Which model actually answered, so the badge in the drawer cannot drift
      // from reality — it read "Gemini 2.5 Flash" as a hardcoded string long
      // after the server had moved on.
      model: modelUsed,
      snapshot,
      suggestions,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    // No silent fallback to invented prose — saying the assistant is
    // unavailable is honest; answering from fiction is not.
    const detail = error?.message ?? String(error);
    console.error('Copilot request failed:', detail);

    // A daily quota is not a transient blip, and telling somebody to "try
    // again shortly" when the budget is spent until tomorrow wastes their time.
    const quotaSpent = /429|RESOURCE_EXHAUSTED|quota/i.test(detail);
    res.status(503).json({
      error: quotaSpent ? 'COPILOT_QUOTA_EXHAUSTED' : 'COPILOT_UNAVAILABLE',
      message: quotaSpent
        ? "The assistant has used up today's request allowance on this API key. It will work again tomorrow, or sooner on a paid plan. Every figure in the panels behind this drawer is still live."
        : 'The assistant could not be reached just now. The live figures are still accurate in the panels behind this drawer.',
      snapshot,
      suggestions,
    });
  }
}));

/** Suggested questions for an empty conversation, from live state. */
app.get('/api/copilot/suggestions', apiRoute(async (req, res) => {
  const user = await requireAuthUser(req, res);
  if (!user) return;
  if (!hasPermission(user.role, 'queue:read')) {
    res.status(403).json({ error: 'AUTHORIZATION_DENIED', message: 'Staff only.' });
    return;
  }
  const snapshot = await buildCopilotSnapshot();
  res.json({ suggestions: copilotSuggestions(snapshot), snapshot, model: ai ? COPILOT_MODEL : null });
}));

// Run Counter AI Optimization Simulation API
app.post('/api/copilot/optimize', (req, res) => {
  const { counters } = req.body;

  // Compute optimized state
  const optimizedCounters = (counters || []).map((c: any) => {
    if (c.id === 'c3') { // Pharmacy
      return { ...c, queueCount: Math.max(8, c.queueCount - 15), avgWaitMin: 12, status: 'Optimal', utilizationPct: 78, densityLevel: 'Moderate' };
    }
    if (c.id === 'c5') { // Registration -> activated
      return { ...c, status: 'Active', queueCount: 14, avgWaitMin: 9, utilizationPct: 72, densityLevel: 'Moderate' };
    }
    if (c.id === 'c1') { // General
      return { ...c, queueCount: 12, avgWaitMin: 10, status: 'Optimal', utilizationPct: 68, densityLevel: 'Moderate' };
    }
    if (c.id === 'c8') { // Backup
      return { ...c, status: 'Active', queueCount: 6, avgWaitMin: 7, utilizationPct: 50, densityLevel: 'Low' };
    }
    return c;
  });

  return res.json({
    success: true,
    message: 'AI Dynamic Load Balancer executed successfully.',
    metrics: {
      avgWaitBeforeMin: 18,
      avgWaitAfterMin: 9,
      improvementPct: 50,
      fairnessBefore: 94,
      fairnessAfter: 98,
      overloadedCountersBefore: 2,
      overloadedCountersAfter: 0,
    },
    counters: optimizedCounters,
    optimizedCounters: optimizedCounters,
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  let dbStatus = 'unknown';
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch {
    dbStatus = 'disconnected';
  }
  res.json({
    status: 'healthy',
    service: 'QueueMind AI Backend',
    geminiEnabled: !!ai,
    database: dbStatus,
    // Which backend holds uploaded images. Names the backend only — never any
    // credential.
    imageStorage: storageBackend(),
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Auth API — /api/auth/*
// ---------------------------------------------------------------------------
// These routes match what src/services/authApi.ts calls:
//   POST /api/auth/register
//   POST /api/auth/login
//   GET  /api/auth/me

/**
 * bcrypt work factor.
 *
 * Each step doubles the work. Cost 12 measured ~2.3s per sign-in on the shared
 * CPU this deploys to, which is the whole of the wait a user sees after
 * pressing "Sign In"; cost 10 is ~4x faster and is the standard default
 * (bcryptjs, Spring Security). Raise it if this ever moves to dedicated CPU —
 * `bcrypt.compare` reads the cost out of each stored hash, so changing this
 * number never invalidates existing passwords.
 */
const PASSWORD_HASH_COST = 10;

/**
 * Close out tokens left unserved when a previous service day ended.
 *
 * The queue reads are already scoped to today, so this is not what keeps stale
 * rows off the board — it is what stops them lingering as permanently "Waiting"
 * data: holding their owner's one-active-token slot, and turning up in history
 * as though the visitor is still queueing days later.
 *
 * Cancelled is used rather than a new status because it is already terminal and
 * already rendered everywhere; the audit row is what records that this was an
 * automatic end-of-day sweep rather than somebody cancelling.
 */
const MAX_TOKEN_AGE_HOURS = Number(process.env.MAX_TOKEN_AGE_HOURS) || 12;

async function expireStaleTokens(): Promise<number> {
  const dayStart = startOfServiceDay();
  // Two ways to be stale, and the queue needs both. The day boundary catches a
  // token left over from yesterday. The age limit catches one issued at ten
  // past midnight and still "Waiting" twenty-one hours later — the same service
  // day by the calendar, but nobody has been standing in the lobby that long.
  const ageCutoff = new Date(Date.now() - MAX_TOKEN_AGE_HOURS * 60 * 60 * 1000);
  try {
    const stale = await prisma.token.findMany({
      where: {
        status: { in: ['Waiting', 'Approaching', 'Serving'] },
        OR: [
          { issuedAt: { lt: dayStart } },
          { issuedAt: { lt: ageCutoff } },
        ],
        deletedAt: null,
      },
      select: { id: true, code: true, facilityId: true, issuedAt: true },
    });
    if (stale.length === 0) return 0;

    await prisma.token.updateMany({
      where: { id: { in: stale.map((t) => t.id) } },
      data: { status: 'Cancelled' },
    });

    // No audit row: audit_logs.actor_id carries a foreign key to a real user,
    // and attributing an automatic sweep to a person would be worse than not
    // recording it. The console line below is the trail, and the codes are
    // named so an expired token can always be accounted for.
    console.log(
      `🧹 Expired ${stale.length} abandoned token(s) — earlier service day, or unserved for over ` +
      `${MAX_TOKEN_AGE_HOURS}h (${stale.slice(0, 20).map((t) => t.code).join(', ')}${stale.length > 20 ? ', …' : ''})`,
    );

    // One nudge per facility is enough — subscribers treat this as "the queue
    // moved, refetch" rather than reading the individual token out of it.
    for (const facilityId of new Set(stale.map((t) => t.facilityId))) {
      const first = stale.find((t) => t.facilityId === facilityId)!;
      publishEvent({ type: 'token.status', tokenId: first.id, status: 'Cancelled', facilityId });
    }

    return stale.length;
  } catch (err) {
    // A failed sweep must never stop the server serving today's queue.
    console.error('Failed to expire stale tokens:', err);
    return 0;
  }
}

/**
 * Migrates one password to the current work factor, in the background.
 *
 * Only ever called just after `bcrypt.compare` returned true, so the plaintext
 * is known-correct. Failure is deliberately silent: the sign-in it follows has
 * already succeeded, and a hash that stays on the old cost is merely slower,
 * never wrong.
 */
async function rehashPasswordIfStale(userId: string, storedHash: string, password: string): Promise<void> {
  try {
    if (bcrypt.getRounds(storedHash) === PASSWORD_HASH_COST) return;
    const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_COST);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    invalidateUser(userId);
  } catch {
    // Left on the old cost; the next sign-in tries again.
  }
}

app.post('/api/auth/register', apiRoute(async (req, res) => {
  if (!enforceRateLimit(req, res, 'register', 30, 60_000)) return;

  const body = bodyAsObject(req);
  const name = requiredString(body.name, 'Name');
  const email = requiredString(body.email, 'Email');
  const password = requiredString(body.password, 'Password');

  if (password.length < 6) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Password must be at least 6 characters.', { field: 'password' });
  }

  // Check if email already exists
  const existing = await UserRepo.findByEmail(email);
  if (existing) {
    throw new ApiError(409, 'EMAIL_EXISTS', 'An account with this email already exists.');
  }

  // Get default facility
  const facility = await getCachedFacility();

  // Hash password — never store plaintext
  const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_COST);

  // Self-registration ALWAYS produces a VISITOR. Any `role` in the request body
  // is ignored: this endpoint previously honoured it, which let anyone sign
  // themselves up as MANAGER — a role holding queue:edit, appointments:manage,
  // schedule:manage and cameras:manage. Elevation now happens only through
  // PATCH /api/super-admin/users/:id/role, performed by a verified SUPER_ADMIN.
  const user = await UserRepo.create({
    name,
    email,
    passwordHash,
    role: 'VISITOR',
    facilityId: facility?.id,
  });

  if (typeof body.role === 'string' && body.role.toUpperCase() !== 'VISITOR') {
    // Worth seeing in the audit trail: somebody asked for elevated access.
    await recordAudit({ id: user.id, role: 'VISITOR' }, 'self_register_role_ignored', 'user', user.id, 'denied');
  }

  // Sign JWT
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' },
  );

  res.json({ token, user: publicUserView(user) });
}));

app.post('/api/auth/login', apiRoute(async (req, res) => {
  // Slows password guessing without locking out a team sharing one address.
  if (!enforceRateLimit(req, res, 'login', 60, 60_000)) return;

  const body = bodyAsObject(req);
  const email = requiredString(body.email, 'Email');
  const password = requiredString(body.password, 'Password');

  const user = await UserRepo.findByEmail(email);
  if (!user) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  // Accounts created under an older work factor keep paying its cost on every
  // sign-in. Now that we hold the plaintext and know it is correct, re-hash at
  // the current cost — after the response, so the user never waits for it.
  void rehashPasswordIfStale(user.id, user.passwordHash, password);

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' },
  );

  res.json({ token, user: publicUserView(user) });
}));

app.post('/api/auth/google', apiRoute(async (req, res) => {
  const body = bodyAsObject(req);
  const idToken = requiredString(body.idToken, 'Google ID Token');

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new ApiError(500, 'CONFIGURATION_ERROR', 'Google OAuth is not configured on the server.');
  }

  const client = new OAuth2Client(clientId);
  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: clientId,
    });
    payload = ticket.getPayload();
  } catch (error) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid Google authentication token.');
  }

  if (!payload || !payload.email || !payload.name) {
    throw new ApiError(400, 'INVALID_CREDENTIALS', 'Incomplete Google profile data.');
  }

  const email = payload.email;
  const name = payload.name;

  // An account created by the Super Admin (e.g. a doctor) MUST be reused here.
  // findByEmail is case-insensitive, so Google can never fork a second profile.
  let user = await UserRepo.findByEmail(email);
  if (!user) {
    const facility = await getCachedFacility();
    // For Google Sign In, generate a random secure password hash since they won't use password login
    const randomPassword = randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(randomPassword, PASSWORD_HASH_COST);

    user = await UserRepo.create({
      name,
      email,
      passwordHash,
      role: 'VISITOR',
      facilityId: facility?.id,
      avatarUrl: payload.picture ?? null,
    });
  } else if (!user.avatarUrl && payload.picture) {
    // Adopt the Google photo only when the profile has none — an uploaded
    // photo always wins, and the account's role is never touched.
    user = await UserRepo.updateProfile(user.id, { avatarUrl: payload.picture });
    invalidateUser(user.id);
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' },
  );

  res.json({ token, user: publicUserView(user) });
}));

// ---------------------------------------------------------------------------
// Google OAuth — Authorization Code Flow
// ---------------------------------------------------------------------------

/**
 * GET /api/auth/google/url — Returns the Google OAuth authorization URL.
 * The frontend redirects the user to this URL.
 */
app.get('/api/auth/google/url', apiRoute(async (_req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new ApiError(500, 'CONFIGURATION_ERROR',
      'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
  }

  // Determine the app's public URL for the callback
  const appUrl = (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL')
    ? process.env.APP_URL.replace(/\/+$/, '')
    : `http://localhost:${PORT}`;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/auth/google/callback`;

  const client = new OAuth2Client(clientId, clientSecret, redirectUri);

  // Generate a CSRF state token
  const state = randomBytes(16).toString('hex');

  const authorizeUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
    redirect_uri: redirectUri,
  });

  res.json({ url: authorizeUrl, state });
}));

/**
 * GET /api/auth/google/callback — Handles the redirect from Google.
 * Exchanges the authorization code for tokens, verifies identity,
 * creates/finds the application user, issues a QueueMind JWT,
 * and redirects back to the frontend.
 */
app.get(['/api/auth/google/callback', '/auth/google/callback'], async (req, res) => {
  try {
    const code = req.query.code;
    const errorParam = req.query.error;

    if (errorParam) {
      // Google denied or user cancelled
      const appUrl = (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL')
        ? process.env.APP_URL.replace(/\/+$/, '')
        : `http://localhost:${PORT}`;
      return res.redirect(`${appUrl}/#auth_error=${encodeURIComponent(String(errorParam))}`);
    }

    if (typeof code !== 'string' || !code) {
      const appUrl = (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL')
        ? process.env.APP_URL.replace(/\/+$/, '')
        : `http://localhost:${PORT}`;
      return res.redirect(`${appUrl}/#auth_error=missing_code`);
    }

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const appUrl = (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL')
      ? process.env.APP_URL.replace(/\/+$/, '')
      : `http://localhost:${PORT}`;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/auth/google/callback`;

    const client = new OAuth2Client(clientId, clientSecret, redirectUri);

    // Exchange authorization code for tokens
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Verify the ID token to get user info
    if (!tokens.id_token) {
      return res.redirect(`${appUrl}/#auth_error=no_id_token`);
    }

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: clientId,
    });
    const payload = ticket.getPayload();

    if (!payload || !payload.email || !payload.name) {
      return res.redirect(`${appUrl}/#auth_error=incomplete_profile`);
    }

    const email = payload.email;
    const name = payload.name;

    // Find or create the user (same Google account always maps to same QueueMind
    // user). A doctor assigned by the Super Admin signs in straight into that
    // existing DOCTOR account — no duplicate profile is ever created.
    let user = await UserRepo.findByEmail(email);
    if (!user) {
      const facility = await getCachedFacility();
      const randomPassword = randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, PASSWORD_HASH_COST);

      user = await UserRepo.create({
        name,
        email,
        passwordHash,
        role: 'VISITOR',
        facilityId: facility?.id,
        avatarUrl: payload.picture ?? null,
      });
    } else if (!user.avatarUrl && payload.picture) {
      user = await UserRepo.updateProfile(user.id, { avatarUrl: payload.picture });
      invalidateUser(user.id);
    }

    // Issue a QueueMind session JWT
    const appToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' },
    );

    // Redirect back to frontend with token and user info in the URL hash
    // (hash fragment is never sent to the server, keeping the token client-side only)
    const userData = encodeURIComponent(JSON.stringify(publicUserView(user)));
    res.redirect(`${appUrl}/#auth_token=${appToken}&auth_user=${userData}`);

  } catch (error: any) {
    console.error('Google OAuth callback error:', error?.message || error);
    const appUrl = (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL')
      ? process.env.APP_URL.replace(/\/+$/, '')
      : `http://localhost:${PORT}`;
    res.redirect(`${appUrl}/#auth_error=oauth_failed`);
  }
});

app.get('/api/auth/me', apiRoute(async (req, res) => {
  const authHeader = req.header('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'No token provided.');
  }

  const token = authHeader.slice(7);
  let payload: { userId: string };
  try {
    payload = jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch {
    throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Invalid or expired token.');
  }

  const user = await prisma.user.findFirst({
    where: { id: payload.userId, deletedAt: null },
    include: { doctor: { select: { id: true } } },
  });
  if (!user) {
    throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'User not found.');
  }

  res.json({ user: publicUserView(user, user.doctor?.id) });
}));

// ---------------------------------------------------------------------------
// Domain Services (PostgreSQL-backed)
// ---------------------------------------------------------------------------

const TokenService = {
  /**
   * Generate a walk-in token. Uses atomic DB sequence increment.
   *
   * Nobody may hold two live queue positions, so if the caller already has an
   * active token that token is returned unchanged. This is what makes the
   * endpoint refresh-safe: re-submitting the form rejoins the existing queue
   * position instead of minting a second one. A partial unique index
   * (tokens_one_active_per_user) backs the same rule at the database level.
   */
  async generateWalkInToken(serviceId: string, visitorName?: string, phone?: string, userId?: string) {
    const service = await findService(serviceId);
    const facility = await getCachedFacilityOrThrow();

    const existing = await findActiveTokenFor(userId, phone, facility.id);
    if (existing) {
      // The access key is not re-issued: the original holder already stored it.
      return { token: existing, accessKey: undefined, replayed: true as const };
    }

    // Atomic sequence increment — concurrency-safe
    const tokenNumber = await FacilityRepo.nextWalkInNumber(facility.id);
    const code = `A-${tokenNumber}`;
    const accessKey = generateAccessKey();
    const accessKeyHash = hashAccessKey(accessKey);

    try {
      const token = await TokenRepo.create({
        code,
        facilityId: facility.id,
        serviceId: service.id,
        visitorName,
        phone,
        userId,
        accessKeyHash,
      });

      publishEvent({ type: 'token.created', tokenId: token.id, facilityId: facility.id });
      return { token, accessKey };
    } catch (err: any) {
      // Two simultaneous submissions: the unique index rejected the second one,
      // so hand back whichever token won the race.
      if (err.code === 'P2002') {
        const winner = await findActiveTokenFor(userId, phone, facility.id);
        if (winner) return { token: winner, accessKey: undefined, replayed: true as const };
      }
      throw err;
    }
  },
};

/**
 * An appointment the same requester already holds in this exact slot.
 * Signed-in patients are matched on their account, anonymous ones on the phone
 * number they booked with. Terminal bookings (denied, cancelled, missed) are
 * excluded so a patient can rebook a slot they lost.
 */
async function findOwnAppointmentAt(
  doctorId: string,
  date: string,
  time: string,
  patientUserId: string | undefined,
  phone: string,
) {
  const existing = await prisma.appointment.findFirst({
    where: { doctorId, date, time, deletedAt: null },
  });
  if (!existing) return null;

  const sameRequester = patientUserId
    ? existing.userId === patientUserId
    // Without an account, the phone is the only identity we have. A booking
    // with no phone at all cannot be matched, so it is never treated as a
    // resubmit of somebody else's slot.
    : existing.userId === null && !!phone && existing.phone === phone;

  if (!sameRequester) return null;
  if (['Denied', 'Cancelled', 'Missed'].includes(existing.status)) return null;

  return existing;
}

/**
 * The caller's live queue token, if any. Signed-in visitors are matched on
 * their account; anonymous ones on the phone number they queued with.
 */
async function findActiveTokenFor(userId: string | undefined, phone: string | undefined, facilityId: string) {
  const activeStatuses = ['Waiting', 'Approaching', 'Serving'] as const;

  if (userId) {
    return prisma.token.findFirst({
      where: { userId, facilityId, deletedAt: null, status: { in: [...activeStatuses] } },
      include: { service: true },
      orderBy: { issuedAt: 'desc' },
    });
  }

  if (phone) {
    return prisma.token.findFirst({
      where: { phone, facilityId, userId: null, deletedAt: null, status: { in: [...activeStatuses] } },
      include: { service: true },
      orderBy: { issuedAt: 'desc' },
    });
  }

  return null;
}

const AppointmentService = {
  /**
   * Book a new appointment.
   *
   * The booking enters as `Pending`: it is a request the doctor must approve or
   * deny before the patient joins any queue.
   *
   * Double-booking is blocked by UNIQUE(doctorId, date, time). When the clash is
   * the *same* patient re-submitting (a refresh, a double tap, a retried
   * request), their original appointment is returned instead of an error, so a
   * refresh can never produce a second booking.
   */
  async bookAppointment(
    doctorId: string, date: string, time: string,
    patientName: string, phone: string | null,
    reasonForVisit: string, existingDiagnosis?: string,
    patientUserId?: string,
    bookedAtDesk = false,
  ) {
    // Resubmit check first: if this patient already holds the slot, hand back
    // their booking rather than reporting a clash with themselves. This is what
    // makes a refresh or a double tap safe.
    const replay = await findOwnAppointmentAt(doctorId, date, time, patientUserId, phone);
    if (replay) {
      return { appointment: replay, accessKey: undefined, replayed: true as const };
    }

    await assertBookableSlot(doctorId, date, time);
    const facility = await getCachedFacilityOrThrow();

    // Atomic sequence increment — concurrency-safe
    const appointmentNumber = await FacilityRepo.nextAppointmentNumber(facility.id);
    const code = `DR-${appointmentNumber}`;
    const accessKey = generateAccessKey();
    const accessKeyHash = hashAccessKey(accessKey);

    try {
      const appointment = await AppointmentRepo.create({
        code,
        facilityId: facility.id,
        doctorId,
        patientName,
        phone,
        date,
        time,
        reasonForVisit,
        existingDiagnosis,
        accessKeyHash,
        userId: patientUserId,
        status: 'Pending',
        bookedAtDesk,
      });

      publishEvent({ type: 'appointment.created', appointmentId: appointment.id, doctorId, facilityId: facility.id });
      return { appointment, accessKey };
    } catch (err: any) {
      // Two identical submissions in flight at once: the unique index rejected
      // the loser, so return whichever booking won the race.
      if (err.code === 'P2002') {
        const winner = await findOwnAppointmentAt(doctorId, date, time, patientUserId, phone);
        if (winner) {
          return { appointment: winner, accessKey: undefined, replayed: true as const };
        }

        throw new ApiError(409, 'APPOINTMENT_SLOT_UNAVAILABLE', 'That doctor already has an appointment at the requested time.', {
          doctorId,
          date,
          time: formatTime(time),
        });
      }
      throw err;
    }
  },
};

/**
 * The one place an appointment's status changes.
 *
 * Guarantees, in order:
 *  1. Re-sending the current status is a no-op, so a double-click or a page
 *     refresh cannot produce a spurious error or a duplicate side effect.
 *  2. Illegal moves (Denied → Approved, anything out of a terminal state) are
 *     refused by lib/appointmentState.ts.
 *  3. The write is conditional on the row's `version`, so when two people act
 *     on the same appointment at once exactly one wins and the other is told
 *     the state moved instead of silently overwriting it.
 */
async function applyAppointmentStatus(
  appointment: { id: string; code: string; status: string; version: number },
  nextStatus: AppointmentStatus,
  actor: { id: string; role: string },
  expectedVersion?: unknown,
  statusReason?: string | null,
) {
  const current = appointment.status as AppointmentStatus;

  if (current === nextStatus) {
    return prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
  }

  // Staleness is checked before legality on purpose: if the caller acted on a
  // version that has since moved, the honest answer is "someone else changed
  // this", not "that move is illegal" — the move was legal when they saw it.
  if (expectedVersion !== undefined && expectedVersion !== null && Number(expectedVersion) !== appointment.version) {
    throw new ApiError(409, 'STALE_APPOINTMENT', 'This appointment was updated by someone else. Reload to see the current state.', {
      appointmentId: appointment.id,
      currentStatus: current,
      currentVersion: appointment.version,
    });
  }

  const problem = transitionError(current, nextStatus);
  if (problem) {
    throw new ApiError(409, 'INVALID_TRANSITION', problem, {
      appointmentId: appointment.id,
      from: current,
      to: nextStatus,
    });
  }

  const result = await prisma.appointment.updateMany({
    where: { id: appointment.id, version: appointment.version },
    data: {
      status: nextStatus as any,
      version: { increment: 1 },
      // A new reason replaces the old one; moving on without one clears it.
      statusReason: statusReason ?? null,
    },
  });

  if (result.count === 0) {
    const fresh = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    throw new ApiError(409, 'STALE_APPOINTMENT', 'This appointment was updated by someone else. Reload to see the current state.', {
      appointmentId: appointment.id,
      currentStatus: fresh?.status ?? 'unknown',
      currentVersion: fresh?.version ?? null,
    });
  }

  await recordAudit(actor, 'update_appointment_status', 'appointment', appointment.id);
  publishEvent({ type: 'appointment.status', appointmentId: appointment.id, status: nextStatus });

  return prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
}

const AdminAppointmentService = {
  /**
   * Reschedule a single appointment atomically using a Prisma transaction.
   */
  async reschedule(
    appointmentId: string,
    newDoctorId: string,
    newDate: string,
    newTime: string,
    adminId: string,
  ) {
    const apt = await getAppointmentOrThrow(appointmentId);
    const previousDoctorId = apt.doctorId;
    const previousDate = apt.date;
    const previousTime = apt.time;

    // Validate BEFORE any mutation
    await assertBookableSlot(newDoctorId, newDate, newTime, apt.id);

    // Execute everything in a single database transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update appointment
      const updatedApt = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          doctorId: newDoctorId,
          date: newDate,
          time: newTime,
          version: { increment: 1 },
        },
      });

      // Create schedule change record
      const scheduleChange = await tx.scheduleChange.create({
        data: {
          appointmentId: apt.id,
          previousDoctorId,
          previousDate,
          previousTime,
          newDoctorId,
          newDate,
          newTime,
          approvedBy: adminId,
        },
      });

      return { updatedApt, scheduleChange };
    });

    // Create notification (outside transaction since mock dispatch is non-critical)
    const notification = await createNotification(
      { id: apt.id, doctorId: newDoctorId, phone: apt.phone, code: apt.code },
      previousTime,
      newTime,
    );

    // Audit
    await recordAudit({ id: adminId, role: 'manager' }, 'reschedule_appointment', 'appointment', apt.id);

    return { appointment: result.updatedApt, scheduleChange: result.scheduleChange, notification };
  },

  async batchReschedule(
    changes: { appointmentId: string; newDoctorId: string; newDate: string; newTime: string }[],
    adminId: string,
  ) {
    // Phase 1 — validate all changes (no mutations)
    const validChanges = [];
    for (const change of changes) {
      const apt = await getAppointmentOrThrow(change.appointmentId);
      await assertBookableSlot(change.newDoctorId, change.newDate, change.newTime, apt.id);
      validChanges.push({ apt, change });
    }

    // Phase 2 — execute all inside one single transaction
    const results = await prisma.$transaction(async (tx) => {
      const txResults = [];
      for (const { apt, change } of validChanges) {
        const updatedApt = await tx.appointment.update({
          where: { id: apt.id },
          data: {
            doctorId: change.newDoctorId,
            date: change.newDate,
            time: change.newTime,
            version: { increment: 1 },
          },
        });

        const scheduleChange = await tx.scheduleChange.create({
          data: {
            appointmentId: apt.id,
            previousDoctorId: apt.doctorId,
            previousDate: apt.date,
            previousTime: apt.time,
            newDoctorId: change.newDoctorId,
            newDate: change.newDate,
            newTime: change.newTime,
            approvedBy: adminId,
          },
        });
        txResults.push({ updatedApt, scheduleChange, apt, change });
      }
      return txResults;
    });

    // Phase 3 — post-transaction side effects (notifications & audit)
    const finalResults = [];
    for (const res of results) {
      const notification = await createNotification(
        { id: res.apt.id, doctorId: res.change.newDoctorId, phone: res.apt.phone, code: res.apt.code },
        res.apt.time,
        res.change.newTime,
      );
      await recordAudit({ id: adminId, role: 'manager' }, 'reschedule_appointment', 'appointment', res.apt.id);
      finalResults.push({ appointment: res.updatedApt, scheduleChange: res.scheduleChange, notification });
    }

    return finalResults;
  },
};

/**
 * Deterministic scheduling recommendation service.
 */
const AIRecommendationService = {
  async recommendReschedule(appointmentIds: string[]) {
    const recommendations: {
      appointmentId: string;
      code: string;
      patientName: string;
      previousTime: string;
      newTime: string;
      rawNewTime: string;
    }[] = [];
    const reservedKeys = new Set<string>();

    for (const id of appointmentIds) {
      const apt = await AppointmentRepo.findById(id);
      if (!apt) continue;
      const nextSlot = await findNextRecommendedSlot(apt.doctorId, apt.date, apt.time, reservedKeys);
      if (nextSlot) {
        reservedKeys.add(`${apt.doctorId}:${apt.date}:${nextSlot}`);
        recommendations.push({
          appointmentId: apt.id,
          code: apt.code,
          patientName: apt.patientName,
          previousTime: formatTime(apt.time),
          newTime: formatTime(nextSlot),
          rawNewTime: nextSlot,
        });
      }
    }
    return recommendations;
  },
};

// ---------------------------------------------------------------------------
// Visitor API  —  routes match src/services/queueApi.ts exactly
// ---------------------------------------------------------------------------

app.get('/api/visitor/services', apiRoute(async (_req, res) => {
  // Reference data: both reads come from the in-memory cache after first use.
  const facility = await getCachedFacility();
  if (!facility) {
    return res.json({ services: [] });
  }
  // Service rows are cached, but the queue length is not — it changes with every
  // token. `Service.peopleWaiting` is a static seed column that nothing keeps up
  // to date, so the live count is grouped straight from the token table.
  const [services, active] = await Promise.all([
    getCachedServices(facility.id),
    prisma.token.groupBy({
      by: ['serviceId'],
      where: {
        facilityId: facility.id,
        deletedAt: null,
        status: { in: ['Waiting', 'Approaching'] },
      },
      _count: { _all: true },
    }),
  ]);

  const waitingByService = new Map(active.map((row) => [row.serviceId, row._count._all]));

  res.json({
    services: services.map((s) => {
      const peopleWaiting = waitingByService.get(s.id) ?? 0;
      return {
        id: s.id,
        name: s.name,
        description: s.description,
        // Same estimate the token card shows, so the kiosk tile and the issued
        // token never quote different waits.
        estimatedWaitMinutes: peopleWaiting === 0
          ? 0
          : Math.max(s.estimatedWaitMinutes, Math.ceil(peopleWaiting * 1.7)),
        peopleWaiting,
        defaultCounterName: s.defaultCounterName,
      };
    }),
  });
}));

app.post('/api/visitor/tokens', apiRoute(async (req, res) => {
  // Sized for a shared address: a lobby kiosk, or a whole team testing behind
  // one router. Well above any human pace, far below a flood.
  if (!enforceRateLimit(req, res, 'token', 40, 60_000)) return;

  const body = bodyAsObject(req);
  const serviceId = requiredString(body.serviceId, 'Service ID');
  const visitorName = optionalString(body.name, 'Visitor Name');
  // Optional: a lobby kiosk issues anonymous tokens, while the mobile flow
  // collects a number so the visitor can be pinged when their turn nears.
  const phone = validatedPhone(body.phone, false);

  // Optionally extract userId if authenticated
  let userId: string | undefined;
  const authHeader = req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const tokenStr = authHeader.slice(7);
    try {
      const payload = jwt.verify(tokenStr, JWT_SECRET) as { userId: string };
      userId = payload.userId;
    } catch {
      // Ignore invalid auth for visitor endpoint
    }
  }

  const result = await TokenService.generateWalkInToken(serviceId, visitorName, phone, userId);

  // Flat response — queueApi.ts reads token.id and token.accessKey directly.
  // `replayed` tells the client this is their existing queue position being
  // handed back (a refresh or double submit), not a newly issued token.
  const publicToken = await toPublicToken(result.token);
  res.json({
    ...publicToken,
    ...(result.accessKey ? { accessKey: result.accessKey } : {}),
    ...('replayed' in result && result.replayed ? { replayed: true } : {}),
  });
}));

app.get('/api/visitor/my-token', apiRoute(async (req, res) => {
  const authHeader = req.header('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Not authenticated.');
  }
  let userId: string;
  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as { userId: string };
    userId = payload.userId;
  } catch {
    throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Invalid token.');
  }

  const activeToken = await TokenRepo.findActiveForUser(userId);
  if (!activeToken) {
    return res.json({ token: null });
  }

  const publicToken = await toPublicToken(activeToken);
  res.json({ token: publicToken });
}));

/**
 * GET /api/visitor/my-appointments — the signed-in patient's own bookings.
 *
 * Scoped by Appointment.userId taken from the verified JWT, so this returns one
 * person's bookings and nobody else's. No access key is needed because the
 * session already proves who is asking.
 */
app.get('/api/visitor/my-appointments', apiRoute(async (req, res) => {
  const user = await requireAuthUser(req, res);
  if (!user) return;

  // Visit history means every visit, not only doctor appointments — a patient
  // whose history is all walk-in tokens previously saw "No past visits yet".
  const [appointments, tokens] = await Promise.all([
    prisma.appointment.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: [{ date: 'desc' }, { time: 'desc' }],
      take: 50,
      include: { doctor: { include: { department: true } } },
    }),
    prisma.token.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: { issuedAt: 'desc' },
      take: 50,
      include: { service: { select: { name: true, defaultCounterName: true } } },
    }),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  res.json({
    appointments: appointments.map((apt) => ({
      id: apt.id,
      code: apt.code,
      date: apt.date,
      time: formatTime(apt.time),
      rawTime: apt.time,
      doctorId: apt.doctorId,
      doctor: `Dr. ${apt.doctor.name}`,
      doctorPhotoUrl: apt.doctor.photoUrl ?? null,
      department: apt.doctor.department.name,
      reasonForVisit: apt.reasonForVisit,
      // Same projection the doctor and staff screens derive from.
      status: toPatientStatus(apt.status),
      lifecycleStatus: apt.status,
      awaitingApproval: apt.status === 'Pending',
      statusReason: apt.statusReason ?? null,
      inQueue: isQueueEligible(apt.status),
      upcoming: apt.date >= today && isQueueEligible(apt.status),
    })),
    // Walk-in visits, in the same shape the history list renders.
    visits: tokens.map((t) => {
      const issued = t.issuedAt instanceof Date ? t.issuedAt : new Date(t.issuedAt);
      const active = ['Waiting', 'Approaching', 'Serving'].includes(t.status);
      return {
        id: t.id,
        code: t.code,
        kind: 'walk-in' as const,
        date: issued.toISOString().slice(0, 10),
        time: issued.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        serviceName: t.service.name,
        counterName: t.counterName ?? t.service.defaultCounterName ?? null,
        status: t.status,
        active,
      };
    }),
  });
}));

app.get('/api/visitor/tokens/:id', apiRoute(async (req, res) => {
  const id = req.params.id;
  const token = await TokenRepo.findById(id);
  if (!token) {
    throw new ApiError(404, 'TOKEN_NOT_FOUND', 'The token was not found.');
  }

  const authHeader = req.header('authorization');
  let userId: string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      userId = (jwt.verify(authHeader.slice(7), JWT_SECRET) as { userId: string }).userId;
    } catch { }
  }

  // The owner, somebody holding the private key, or the staff who run this
  // queue. Anyone else is refused.
  if (!userId || userId !== token.userId) {
    if (!(await callerRunsTheQueue(req))) {
      requireVisitorAccess(req, token.accessKeyHash, 'token', token.id);
    }
  }
  const publicToken = await toPublicToken(token);
  res.json(publicToken);
}));

/**
 * Visitor queue position — returns the visitor's position in their service
 * queue with anonymous token codes around them. NO private data exposed.
 */
/**
 * Ownership check shared by the visitor's own token edit and cancel routes:
 * either the signed-in owner, or somebody holding the token's access key.
 */
async function requireTokenOwner(
  req: express.Request,
  token: { id: string; userId: string | null; accessKeyHash: string },
  /**
   * A staff capability that also satisfies this check.
   *
   * Passed only where the same act already has an admin route with the same
   * authority — completing a visit. Editing and cancelling deliberately do NOT
   * pass one: those go through /api/admin/tokens/:id, which writes the audit
   * row the Super Admin's queue-activity feed reads. Opening them here would
   * let an administrator change somebody's place in the queue unobserved.
   */
  staffPermission?: Permission,
) {
  const authHeader = req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as { userId: string };
      if (token.userId && payload.userId === token.userId) return;

      if (staffPermission) {
        // Role from the database, never from the JWT claim.
        let user: any = getCachedUser(payload.userId);
        if (user === undefined) {
          user = await prisma.user.findFirst({
            where: { id: payload.userId, deletedAt: null },
            include: { doctor: { select: { id: true } } },
          });
          setCachedUser(payload.userId, user);
        }
        if (user && hasPermission(user.role, staffPermission)) return;
      }
    } catch {
      // Fall through to the access-key check.
    }
  }
  requireVisitorAccess(req, token.accessKeyHash, 'token', token.id);
}

/**
 * PATCH /api/visitor/tokens/:id — the visitor corrects their own token.
 *
 * Name and phone are simple corrections and keep the queue position. Switching
 * service is a different queue, so the token is re-issued at the back of it —
 * jumping ahead of people already waiting there would not be fair.
 */
app.patch('/api/visitor/tokens/:id', apiRoute(async (req, res) => {
  const token = await TokenRepo.findById(req.params.id);
  if (!token) throw new ApiError(404, 'TOKEN_NOT_FOUND', 'The token was not found.');
  await requireTokenOwner(req, token);

  if (!['Waiting', 'Approaching'].includes(token.status)) {
    throw new ApiError(409, 'TOKEN_NOT_EDITABLE',
      token.status === 'Serving'
        ? 'You are being served now, so this token can no longer be edited.'
        : 'This token is no longer active.');
  }

  const body = bodyAsObject(req);
  const data: Record<string, unknown> = {};

  // A blank field means "leave this as it was" rather than "erase it", so a
  // visitor correcting one detail never wipes the others by omission.
  const name = optionalString(body.name, 'Name', 120);
  if (name !== undefined) data.visitorName = name;

  const phone = validatedPhone(body.phone, false);
  if (phone !== undefined) data.phone = phone;

  let requeued = false;
  if (body.serviceId !== undefined) {
    const serviceId = requiredString(body.serviceId, 'Service');
    const service = await findService(serviceId);
    if (service.id !== token.serviceId) {
      data.serviceId = service.id;
      // New queue, new place in line: issued now, so they join the back.
      data.issuedAt = new Date();
      requeued = true;
    }
  }

  if (Object.keys(data).length === 0) {
    // Submitting an unchanged form is harmless — hand back the current token.
    const unchanged = await toPublicToken(token);
    return res.json({ ...unchanged, requeued: false, visitorName: token.visitorName, phone: token.phone });
  }

  const updated = await prisma.token.update({ where: { id: token.id }, data });
  publishEvent({ type: 'token.status', tokenId: updated.id, status: updated.status, facilityId: updated.facilityId });

  const publicToken = await toPublicToken(updated);
  // The editable fields come back too, so the caller can repaint immediately
  // instead of waiting for the next poll.
  res.json({ ...publicToken, requeued, visitorName: updated.visitorName, phone: updated.phone });
}));

/**
 * POST /api/visitor/tokens/:id/complete — the visitor confirms their
 * consultation is finished.
 *
 * Completing frees the slot and, when this was the token being served, calls the
 * next person forward — the same queue advance staff perform, just initiated by
 * the patient. Both writes go out in one transaction so the board is never seen
 * in a half-updated state.
 *
 * A token still marked Waiting has not been called yet, so the UI warns before
 * reaching here; the endpoint still honours it, because a patient seen out of
 * band is a real thing that should not leave a stale row in the queue.
 */
app.post('/api/visitor/tokens/:id/complete', apiRoute(async (req, res) => {
  const token = await TokenRepo.findById(req.params.id);
  if (!token) throw new ApiError(404, 'TOKEN_NOT_FOUND', 'The token was not found.');
  // Staff running the board mark visits done from the tracker too;
  // /api/admin/tokens/:id/complete is the same act with the same
  // permission, so this is not a new authority.
  await requireTokenOwner(req, token, 'queue:manage');

  if (['Completed', 'Cancelled'].includes(token.status)) {
    // Re-sending is a no-op rather than an error: a double tap or a retried
    // request should not fail after the first one already succeeded.
    return res.json({ completed: await toPublicToken(token), calledNext: null, alreadyClosed: true });
  }

  const wasBeingServed = token.status === 'Serving';

  // Find the next in line and finish this token together — one round trip each,
  // issued in parallel rather than in sequence.
  const [finished, next] = await Promise.all([
    prisma.token.update({ where: { id: token.id }, data: { status: 'Completed' } }),
    wasBeingServed
      ? prisma.token.findFirst({
          where: {
            serviceId: token.serviceId,
            facilityId: token.facilityId,
            status: { in: ['Waiting', 'Approaching'] },
            deletedAt: null,
            NOT: { id: token.id },
          },
          orderBy: { issuedAt: 'asc' },
        })
      : Promise.resolve(null),
  ]);

  let called = null;
  if (next) {
    called = await prisma.token.update({
      where: { id: next.id },
      data: { status: 'Serving', counterName: next.counterName ?? finished.counterName },
    });
    publishEvent({ type: 'token.status', tokenId: called.id, status: 'Serving', facilityId: called.facilityId });
  }

  await recordAudit(
    { id: token.userId ?? 'visitor', role: 'visitor' },
    'complete_own_token',
    'token',
    token.id,
    wasBeingServed ? 'success' : 'completed_while_waiting',
  );

  // Every open screen repaints from this: the patient's own view, the queue
  // board, the doctor's queue.
  publishEvent({ type: 'token.status', tokenId: finished.id, status: 'Completed', facilityId: finished.facilityId });

  res.json({
    completed: await toPublicToken(finished),
    calledNext: called ? { code: called.code } : null,
    wasBeingServed,
  });
}));

/**
 * DELETE /api/visitor/tokens/:id — the visitor gives up their place.
 *
 * The row is cancelled rather than erased, so the queue keeps its history and
 * the partial unique index frees the visitor to take a fresh token. That new
 * token is issued at the current time, which puts them at the back of the line.
 */
app.delete('/api/visitor/tokens/:id', apiRoute(async (req, res) => {
  const token = await TokenRepo.findById(req.params.id);
  if (!token) throw new ApiError(404, 'TOKEN_NOT_FOUND', 'The token was not found.');
  await requireTokenOwner(req, token);

  if (['Completed', 'Cancelled'].includes(token.status)) {
    return res.json({ cancelled: true, id: token.id });
  }

  const cancelled = await prisma.token.update({
    where: { id: token.id },
    data: { status: 'Cancelled' },
  });

  await recordAudit({ id: token.userId ?? 'visitor', role: 'visitor' }, 'cancel_token', 'token', token.id);
  publishEvent({ type: 'token.status', tokenId: cancelled.id, status: 'Cancelled', facilityId: cancelled.facilityId });

  res.json({ cancelled: true, id: cancelled.id, code: cancelled.code });
}));

app.get('/api/visitor/tokens/:id/queue-position', apiRoute(async (req, res) => {
  const id = req.params.id;
  const token = await TokenRepo.findById(id);

  // Fallback: check if it's an Appointment ID
  if (!token) {
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { doctor: { include: { department: true } } },
    });

    if (!appointment) {
      throw new ApiError(404, 'TOKEN_NOT_FOUND', 'The token was not found.');
    }

    // Auth check for appointment
    const authHeader = req.header('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      try {
        jwt.verify(authHeader.slice(7), JWT_SECRET);
      } catch {
        throw new ApiError(401, 'UNAUTHORIZED', 'Invalid token.');
      }
    }

    // Build queue position from the doctor's queue for that day. Only approved
    // appointments hold a place — a request still awaiting approval is not in
    // anybody's queue, so it neither has nor consumes a position.
    const todayAppts = await prisma.appointment.findMany({
      where: {
        doctorId: appointment.doctorId,
        date: appointment.date,
        deletedAt: null,
        status: { in: QUEUE_ELIGIBLE_STATUSES as any },
      },
      orderBy: { time: 'asc' },
    });

    const queued = isQueueEligible(appointment.status);
    const myIndex = todayAppts.findIndex(a => a.id === id);
    const peopleAhead = queued ? Math.max(0, myIndex) : 0;

    return res.json({
      tokenId: appointment.id,
      code: appointment.code,
      status: toTokenStatus(appointment.status),
      // Plain-language state, identical to what the doctor and staff screens
      // derive from the same appointment.
      patientStatus: toPatientStatus(appointment.status),
      awaitingApproval: appointment.status === 'Pending',
      serviceName: `Dr. ${appointment.doctor.name} (${appointment.doctor.department.name})`,
      counterName: `Dr. ${appointment.doctor.name}`,
      peopleAhead,
      estimatedWaitMinutes: queued ? Math.max(0, peopleAhead * 8) : 0,
      issuedAt: appointment.createdAt instanceof Date ? appointment.createdAt.toISOString() : appointment.createdAt,
      queueTokens: todayAppts.map(a => ({
        code: a.code,
        status: toTokenStatus(a.status),
        isOwn: a.id === id,
      })),
      currentServing: null,
      isAppointment: true,
      appointmentTime: appointment.time,
      patientName: appointment.patientName,
    });
  }

  const authHeader = req.header('authorization');
  let userId: string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      userId = (jwt.verify(authHeader.slice(7), JWT_SECRET) as { userId: string }).userId;
    } catch { }
  }

  // The owner, somebody holding the private key, or the staff who run this
  // queue. Anyone else is refused.
  if (!userId || userId !== token.userId) {
    if (!(await callerRunsTheQueue(req))) {
      requireVisitorAccess(req, token.accessKeyHash, 'token', token.id);
    }
  }

  // Calculate real position-based metrics
  const peopleAhead = await TokenRepo.countAheadOf(token);
  const service = await findService(token.serviceId);
  const estimatedWaitMinutes = Math.max(service.estimatedWaitMinutes, Math.ceil(peopleAhead * 1.7));

  // Get anonymous queue context (codes only, no names/phones)
  const queueContext = await TokenRepo.findQueueAround(token);

  res.json({
    tokenId: token.id,
    code: token.code,
    status: token.status,
    serviceName: service.name,
    serviceId: token.serviceId,
    counterName: token.counterName,
    // The holder's own details, so the edit form can pre-fill them. Ownership
    // was proven above, so this is the caller's own data.
    visitorName: token.visitorName,
    phone: token.phone,
    peopleAhead,
    estimatedWaitMinutes,
    issuedAt: token.issuedAt instanceof Date ? token.issuedAt.toISOString() : token.issuedAt,
    // Anonymous queue progression — codes only, NO names or private data
    queueTokens: [
      ...queueContext.ahead.map(t => ({ code: t.code, status: t.status, isOwn: false })),
      { code: token.code, status: token.status, isOwn: true },
      ...queueContext.behind.map(t => ({ code: t.code, status: t.status, isOwn: false })),
    ],
    currentServing: queueContext.serving
      ? { code: queueContext.serving.code, counterName: queueContext.serving.counterName }
      : null,
  });
}));

app.get('/api/visitor/doctors', apiRoute(async (req, res) => {
  const facility = await getCachedFacility();
  if (!facility) return res.json({ doctors: [] });

  const date = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
  // Doctors and the day's availability in two reads, not one per doctor.
  const [allDoctors, availability] = await Promise.all([
    DoctorRepo.findAll(facility.id),
    prisma.doctorAvailability.findMany({ where: { date } }),
  ]);
  const availabilityByDoctor = new Map<string, typeof availability>();
  for (const window of availability) {
    const bucket = availabilityByDoctor.get(window.doctorId) ?? [];
    bucket.push(window);
    availabilityByDoctor.set(window.doctorId, bucket);
  }

  // Public directory: display fields only. No email, no account id, no
  // management controls — those live behind /api/super-admin/doctors.
  const doctorsWithStatus = await Promise.all(
    allDoctors
      .filter((doc) => doc.isActive)
      .map(async (doc) => ({
        id: doc.id,
        name: `Dr. ${doc.name}`,
        department: doc.department.name,
        specialization: doc.department.name,
        photoUrl: doc.photoUrl ?? null,
        qualification: doc.qualification ?? null,
        experienceYears: doc.experienceYears ?? 0,
        consultationFee: doc.consultationFee ?? 0,
        bio: doc.bio ?? null,
        status: deriveDoctorStatus(availabilityByDoctor.get(doc.id) ?? []) as string,
      })),
  );
  res.json({ doctors: doctorsWithStatus });
}));

/**
 * GET /api/visitor/specializations — the facility's specializations, public.
 *
 * Patients cannot call the super-admin department route, so the booking flow
 * reads this one. Each entry carries how many doctors are currently assigned to
 * it, letting the UI show every specialization the hospital has while making it
 * obvious which ones can actually be booked.
 */
app.get('/api/visitor/specializations', apiRoute(async (_req, res) => {
  const facility = await getCachedFacility();
  if (!facility) return res.json({ specializations: [] });

  const departments = await DepartmentRepo.findAll(facility.id);
  const doctors = await DoctorRepo.findAll(facility.id);

  res.json({
    specializations: departments.map((department) => ({
      id: department.id,
      name: department.name,
      doctorCount: doctors.filter((doc) => doc.departmentId === department.id && doc.isActive).length,
    })),
  });
}));

app.get('/api/visitor/doctors/:id/availability', apiRoute(async (req, res) => {
  const doctorId = req.params.id;
  const date = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
  await findDoctor(doctorId);
  const slots = await availableTimesForDoctor(doctorId, date);
  // queueApi.ts expects { availableTimes: string[] } with display-ready strings.
  res.json({ availableTimes: slots.map(formatTime) });
}));

app.post('/api/visitor/appointments', apiRoute(async (req, res) => {
  if (!enforceRateLimit(req, res, 'appointment', 40, 60_000)) return;

  const body = bodyAsObject(req);
  const doctorId = requiredString(body.doctorId, 'Doctor ID');
  const date = validatedDate(body.date);
  const time = normaliseTime(body.time);
  const patientName = requiredString(body.patientName, 'Patient Name');
  const reasonForVisit = requiredString(body.reasonForVisit, 'Reason for Visit');
  const existingDiagnosis = optionalString(body.existingDiagnosis, 'Existing Diagnosis');

  // Identify the caller from the verified JWT. Two things come from it and
  // nothing else: who the patient is, and whether this is a desk booking.
  let patientUserId: string | undefined;
  let callerRole: string | null = null;
  const authHeader = req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as { userId: string };
      const account = await UserRepo.findById(payload.userId);
      if (account) {
        patientUserId = account.id;
        callerRole = account.role;
      }
    } catch {
      // An expired token simply means the booking stays anonymous.
    }
  }

  // Desk booking is derived from the caller's role, never from the request.
  // A `bookedAtDesk` field in the body is ignored entirely, so a public client
  // cannot claim the exemption.
  const isDeskBooking = hasPermission(callerRole, 'appointments:desk-book');

  // Phone stays mandatory for public self-service: nobody can follow up with a
  // visitor who booked from their own device and left no way to reach them.
  // Staff at the desk may omit it — they hand over a printed slip instead.
  const phone = validatedPhone(body.phone, !isDeskBooking) ?? null;

  if (!phone && !isDeskBooking) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Phone number is required.', { field: 'phone' });
  }

  // A desk booking made on someone else's behalf is not the staff member's own
  // appointment, so it must not be linked to their patient record.
  if (isDeskBooking) patientUserId = undefined;

  const result = await AppointmentService.bookAppointment(
    doctorId, date, time, patientName, phone, reasonForVisit, existingDiagnosis, patientUserId, isDeskBooking,
  );

  // Privacy: toVisitorAppointment strips reasonForVisit and raw phone.
  // `replayed` marks a resubmit of a booking this patient already holds.
  const visitorView = await toVisitorAppointment(result.appointment);
  res.json({
    ...visitorView,
    ...(result.accessKey ? { accessKey: result.accessKey } : {}),
    ...('replayed' in result && result.replayed ? { replayed: true } : {}),
  });
}));

app.get('/api/visitor/appointments/:id', apiRoute(async (req, res) => {
  const idOrCode = req.params.id;
  const appointment = await AppointmentRepo.findByIdOrCode(idOrCode);
  if (!appointment) {
    throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', 'The appointment was not found.');
  }
  requireVisitorAccess(req, appointment.accessKeyHash, 'appointment', appointment.id);
  // Privacy: no reasonForVisit, no raw phone.
  const visitorView = await toVisitorAppointment(appointment);
  res.json(visitorView);
}));

app.post('/api/visitor/appointments/:id/reschedule-request', apiRoute(async (req, res) => {
  const idOrCode = req.params.id;
  const appointment = await AppointmentRepo.findByIdOrCode(idOrCode);
  if (!appointment) {
    throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', 'The appointment was not found.');
  }

  // Authenticate via body.accessKey (as sent by queueApi.ts)
  const body = bodyAsObject(req);
  const bodyKey = typeof body.accessKey === 'string' ? body.accessKey : undefined;
  const accessKey = bodyKey || accessKeyFromRequest(req);
  if (!accessKeyMatches(accessKey, appointment.accessKeyHash)) {
    await recordAudit({ id: 'visitor', role: 'visitor-capability' }, 'visitor_access', 'appointment', appointment.id, 'denied');
    throw new ApiError(403, 'VISITOR_ACCESS_DENIED', 'A valid private access key is required.');
  }

  // Find the most recent notification for this appointment and mark response.
  const notification = await NotificationRepo.findLatestForAppointment(appointment.id);

  if (notification && !notification.response) {
    await NotificationRepo.updateResponse(notification.id, 'request_another_time');
  }

  const visitorView = await toVisitorAppointment(appointment);
  res.json({
    ...visitorView,
    notification: notification ? {
      id: notification.id,
      type: 'appointment-updated',
      previousTime: notification.previousTime,
      newTime: notification.newTime,
      status: notification.response === 'request_another_time'
        ? 'Another time requested'
        : notification.response === 'confirmed'
          ? 'Confirmed'
          : 'Pending',
    } : undefined,
  });
}));

// ---------------------------------------------------------------------------
// Admin API  —  routes match src/services/queueApi.ts exactly
// ---------------------------------------------------------------------------

/**
 * Admin token grid — returns all facility tokens for the 3×3 admin dashboard.
 * JWT-protected: SUPER_ADMIN, ADMIN, MANAGER only.
 */
app.get('/api/admin/tokens', apiRoute(async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const facility = await getCachedFacility();
  if (!facility) return res.json({ tokens: [] });

  const search = typeof req.query.search === 'string' ? req.query.search : undefined;

  // 1. Walk-in tokens and today's appointments are independent — one round
  //    trip for both instead of two.
  const todayDate = new Date().toISOString().slice(0, 10);
  const appointmentWhereEarly: any = {
    facilityId: facility.id,
    date: todayDate,
    deletedAt: null,
    status: { in: QUEUE_ELIGIBLE_STATUSES as any },
  };
  if (search) {
    appointmentWhereEarly.OR = [
      { patientName: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [dbTokens, appointments] = await Promise.all([
    TokenRepo.findAllActiveForFacility(facility.id, search),
    prisma.appointment.findMany({
      where: appointmentWhereEarly,
      include: { doctor: { include: { department: true } } },
      orderBy: { time: 'asc' },
    }),
  ]);

  // "People ahead" used to be a query per row. The whole board is now derived
  // from one in-memory pass: within a service queue, the number ahead of a
  // token is simply how many active tokens were issued before it.
  const aheadByToken = computeAheadCounts(dbTokens);

  const walkInTokens = await Promise.all(
    dbTokens.map(async (t) => {
      const peopleAhead = aheadByToken.get(t.id) ?? 0;
      const estWait = Math.max(t.service.estimatedWaitMinutes, Math.ceil(peopleAhead * 1.7));
      return {
        id: t.id,
        kind: 'token' as const,
        code: t.code,
        service: t.service.name,
        patientName: displayVisitorName(t.visitorName, t.code),
        issueTime: t.issuedAt instanceof Date ? t.issuedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : t.issuedAt,
        estWaitMin: estWait,
        peopleAhead,
        counterId: t.counterName || t.service.defaultCounterName || 'Unassigned',
        status: t.status.toLowerCase(),
        priority: 'Normal',
        demographic: 'Standard',
        urgencyScore: 0,
        fairnessAdjustment: 0,
        checkInMethod: 'Kiosk',
      };
    }),
  );

  // 2. Only queue-eligible appointments appear on the board — a request still
  //    awaiting approval, or one denied/cancelled, is not in the queue.

  const appointmentTokens = appointments.map((apt, index) => ({
    id: apt.id,
    // The two halves of this list carry different kinds of identifier. Without
    // saying which, a client cannot know whether `id` addresses a token or an
    // appointment — which is why opening an appointment row asked for a token
    // that does not exist and was told, correctly, that it was not found.
    kind: 'appointment' as const,
    appointmentId: apt.id,
    version: apt.version,
    date: apt.date,
    time: apt.time,
    reasonForVisit: apt.reasonForVisit,
    code: apt.code,
    service: `Dr. ${apt.doctor.name} (${apt.doctor.department.name})`,
    patientName: apt.patientName,
    issueTime: formatTime(apt.time),
    estWaitMin: Math.max(0, index * 8),
    peopleAhead: index,
    counterId: `Dr. ${apt.doctor.name}`,
    status: toQueueStatus(apt.status) ?? 'waiting',
    appointmentStatus: apt.status,
    priority: 'Priority',
    demographic: 'Standard',
    urgencyScore: 0,
    fairnessAdjustment: 0,
    checkInMethod: 'Appointment',
  }));

  // Combine and return both
  res.json({ tokens: [...walkInTokens, ...appointmentTokens] });
}));

/**
 * Resolve the caller for admin queue edits and confirm they hold `queue:edit`.
 * Staff can call and serve, but rewriting somebody's place in the queue is an
 * ADMIN / MANAGER / SUPER_ADMIN action.
 */
async function requireQueueEditor(req: express.Request, res: express.Response) {
  const user = await requireAuthUser(req, res);
  if (!user) return null;

  if (!hasPermission(user.role, 'queue:edit')) {
    res.status(403).json({
      error: 'AUTHORIZATION_DENIED',
      message: 'Only administrators can edit the queue.',
    });
    return null;
  }
  return user;
}

/**
 * PATCH /api/admin/tokens/:id — an administrator edits a queue entry.
 *
 * Every change is written to the audit log, which is what the Super Admin's
 * queue-activity feed reads. An admin cannot alter the queue unobserved.
 */
/**
 * POST /api/admin/tokens/:id/complete — the visit is finished.
 *
 * Marking a token done is what advances the queue: the current token is
 * completed and the next person waiting for that service is called forward.
 * This is floor work, so `queue:manage` (staff and above) is enough.
 */
/**
 * DELETE /api/admin/tokens/:id — an administrator removes a queue entry.
 *
 * Soft delete, not a row deletion: the token keeps its code, its place in the
 * day's numbering, and its audit trail, so a removal can be explained
 * afterwards. Restricted to queue:edit (ADMIN, MANAGER, SUPER_ADMIN) — the same
 * authority as editing, since removing somebody is the larger act of the two.
 */
app.delete('/api/admin/tokens/:id', apiRoute(async (req, res) => {
  const user = await requireQueueEditor(req, res);
  if (!user) return;

  const token = await TokenRepo.findById(req.params.id);
  if (!token) {
    throw new ApiError(404, 'TOKEN_NOT_FOUND', 'That token no longer exists.');
  }

  const reason = optionalString(bodyAsObject(req).reason, 'Reason', 200) ?? null;

  await prisma.token.update({
    where: { id: token.id },
    data: { status: 'Cancelled', deletedAt: new Date() },
  });

  // The Super Admin's queue-activity feed reads these rows: an admin cannot
  // remove somebody from the queue unobserved.
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      actorRole: user.role,
      action: 'delete_token',
      targetType: 'token',
      targetId: token.id,
      metadata: { code: token.code, visitorName: token.visitorName, reason },
    },
  });

  invalidateReferenceCache();
  publishEvent({ type: 'token.status', tokenId: token.id, status: 'Cancelled', facilityId: token.facilityId });

  res.json({ deleted: true, code: token.code });
}));

app.post('/api/admin/tokens/:id/complete', apiRoute(async (req, res) => {
  const user = await requireAuthUser(req, res);
  if (!user) return;

  if (!hasPermission(user.role, 'queue:manage')) {
    res.status(403).json({ error: 'AUTHORIZATION_DENIED', message: 'You cannot update the queue.' });
    return;
  }

  const token = await TokenRepo.findById(req.params.id);
  if (!token) throw new ApiError(404, 'TOKEN_NOT_FOUND', 'The token was not found.');

  if (['Completed', 'Cancelled'].includes(token.status)) {
    throw new ApiError(409, 'TOKEN_ALREADY_CLOSED', 'This token is already closed.');
  }

  const body = bodyAsObject(req);
  // Default is "treated": a visitor who left without being seen is marked
  // cancelled instead, so completion counts stay honest.
  const outcome = body.outcome === 'cancelled' ? 'Cancelled' : 'Completed';

  const finished = await prisma.token.update({
    where: { id: token.id },
    data: { status: outcome },
  });

  // Call the next person waiting for the same service forward.
  const next = await prisma.token.findFirst({
    where: {
      serviceId: token.serviceId,
      facilityId: token.facilityId,
      status: { in: ['Waiting', 'Approaching'] },
      deletedAt: null,
      NOT: { id: token.id },
    },
    orderBy: { issuedAt: 'asc' },
  });

  let called = null;
  if (next) {
    called = await prisma.token.update({
      where: { id: next.id },
      data: { status: 'Serving', counterName: next.counterName ?? finished.counterName },
    });
    publishEvent({ type: 'token.status', tokenId: called.id, status: 'Serving', facilityId: called.facilityId });
  }

  await AuditRepo.record({
    actorId: user.id,
    actorRole: user.role,
    action: outcome === 'Completed' ? 'complete_token' : 'cancel_token',
    targetType: 'token',
    targetId: token.id,
    outcome: 'success',
    metadata: { code: token.code, calledNext: called?.code ?? null } as any,
  });

  publishEvent({ type: 'token.status', tokenId: finished.id, status: outcome, facilityId: finished.facilityId });

  res.json({
    completed: await toPublicToken(finished),
    calledNext: called ? await toPublicToken(called) : null,
  });
}));

app.patch('/api/admin/tokens/:id', apiRoute(async (req, res) => {
  const editor = await requireQueueEditor(req, res);
  if (!editor) return;

  const token = await TokenRepo.findById(req.params.id);
  if (!token) throw new ApiError(404, 'TOKEN_NOT_FOUND', 'The token was not found.');

  const body = bodyAsObject(req);
  const data: Record<string, unknown> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  if (body.status !== undefined) {
    const status = requiredString(body.status, 'Status');
    const valid = ['Waiting', 'Approaching', 'Serving', 'Completed', 'Cancelled'];
    if (!valid.includes(status)) {
      throw new ApiError(400, 'INVALID_STATUS', 'Invalid queue status.', { options: valid });
    }
    if (status !== token.status) {
      data.status = status;
      changes.status = { from: token.status, to: status };
    }
  }

  if (body.counterName !== undefined) {
    const counterName = optionalString(body.counterName, 'Counter', 60) ?? null;
    if (counterName !== token.counterName) {
      data.counterName = counterName;
      changes.counterName = { from: token.counterName, to: counterName };
    }
  }

  if (body.visitorName !== undefined) {
    const visitorName = optionalString(body.visitorName, 'Visitor name', 120) ?? null;
    if (visitorName !== token.visitorName) {
      data.visitorName = visitorName;
      changes.visitorName = { from: token.visitorName, to: visitorName };
    }
  }

  // Moving somebody's place in line is expressed as a new issue time.
  if (body.position === 'front' || body.position === 'back') {
    const neighbours = await prisma.token.findMany({
      where: {
        serviceId: token.serviceId,
        facilityId: token.facilityId,
        status: { in: ['Waiting', 'Approaching'] },
        deletedAt: null,
        NOT: { id: token.id },
      },
      orderBy: { issuedAt: body.position === 'front' ? 'asc' : 'desc' },
      take: 1,
    });
    const edge = neighbours[0]?.issuedAt;
    const shifted = edge
      ? new Date(edge.getTime() + (body.position === 'front' ? -1000 : 1000))
      : new Date();
    data.issuedAt = shifted;
    changes.position = { from: token.issuedAt, to: body.position };
  }

  if (Object.keys(data).length === 0) {
    throw new ApiError(400, 'NOTHING_TO_UPDATE', 'There is nothing to change on this token.');
  }

  const updated = await prisma.token.update({ where: { id: token.id }, data });

  // The audit entry is the Super Admin's notification: who changed what, when.
  await AuditRepo.record({
    actorId: editor.id,
    actorRole: editor.role,
    action: 'edit_queue_token',
    targetType: 'token',
    targetId: token.id,
    outcome: 'success',
    metadata: { code: token.code, changes } as any,
  });

  publishEvent({ type: 'token.status', tokenId: updated.id, status: updated.status, facilityId: updated.facilityId });

  res.json({ token: await toPublicToken(updated), changes });
}));

app.get('/api/admin/doctor-schedule', apiRoute(async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const date = parseDateQuery(req);
  const facility = await getCachedFacility();
  if (!facility) return res.json({ date, doctors: [] });

  // Previously this ran four queries per doctor, plus one per appointment
  // inside toStaffAppointment. Three bulk reads now cover the whole screen.
  const [allDoctors, allAppointments, allAvailability] = await Promise.all([
    DoctorRepo.findAll(facility.id),
    prisma.appointment.findMany({
      where: { facilityId: facility.id, date, deletedAt: null },
      orderBy: { time: 'asc' },
    }),
    prisma.doctorAvailability.findMany({ where: { date } }),
  ]);

  const appointmentsByDoctor = new Map<string, typeof allAppointments>();
  for (const apt of allAppointments) {
    const bucket = appointmentsByDoctor.get(apt.doctorId) ?? [];
    bucket.push(apt);
    appointmentsByDoctor.set(apt.doctorId, bucket);
  }

  const availabilityByDoctor = new Map<string, typeof allAvailability>();
  for (const window of allAvailability) {
    const bucket = availabilityByDoctor.get(window.doctorId) ?? [];
    bucket.push(window);
    availabilityByDoctor.set(window.doctorId, bucket);
  }

  const doctorSchedules = await Promise.all(
    allDoctors.map(async (doc) => {
      const apps = appointmentsByDoctor.get(doc.id) ?? [];
      // The doctor is already loaded, so the DTO no longer re-fetches it per row.
      const staffApps = apps.map((apt) => toStaffAppointmentWith(apt, doc));
      const availability = availabilityByDoctor.get(doc.id) ?? [];
      const status = deriveDoctorStatus(availability);
      return {
        doctor: {
          id: doc.id,
          name: `Dr. ${doc.name}`,
          department: doc.department.name,
          photoUrl: doc.photoUrl ?? null,
        },
        status,
        availability: availability.map((window) => ({
          id: window.id,
          startTime: window.startTime,
          endTime: window.endTime,
          displayWindow: `${formatTime(window.startTime)} – ${formatTime(window.endTime)}`,
          status: window.status,
          delayMinutes: window.delayMinutes ?? null,
          note: window.note ?? null,
        })),
        // Appointments that fall inside a blocked window are the ones that
        // actually need rescheduling.
        conflictingAppointmentIds: staffApps
          .filter((apt: any) => availability.some((window) =>
            (window.status === 'Unavailable' || window.status === 'Delayed')
            && timeIsWithin(apt.rawTime ?? '', window.startTime, window.endTime)))
          .map((apt: any) => apt.id),
        appointments: staffApps,
      };
    }),
  );

  res.json({ date, doctors: doctorSchedules });
}));

app.patch('/api/admin/doctors/:id/availability', apiRoute(async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const doctorId = req.params.id;
  await findDoctor(doctorId);

  const body = bodyAsObject(req);
  const date = validatedDate(body.date);
  const status = requiredString(body.status, 'Status') as DoctorStatus;
  const startTime = body.startTime ? normaliseTime(body.startTime, 'Start Time') : '09:00';
  const endTime = body.endTime ? normaliseTime(body.endTime, 'End Time') : '17:00';
  const delayMinutes = typeof body.delayMinutes === 'number' ? body.delayMinutes : undefined;
  const note = optionalString(body.note, 'Note');

  const availability = await AvailabilityRepo.upsert({
    doctorId,
    date,
    startTime,
    endTime,
    status,
    delayMinutes,
    note,
    updatedBy: admin.id,
  });

  await recordAudit(admin, 'update_availability', 'availability', availability.id);

  const affected = status === 'Unavailable'
    ? await AppointmentRepo.findActiveByDoctorDateTimeRange(doctorId, date, startTime, endTime)
    : [];

  res.json({
    message: `Doctor status set to ${status}.`,
    availability: {
      id: availability.id,
      doctorId,
      date,
      startTime,
      endTime,
      status,
      delayMinutes,
    },
    affectedAppointments: affected.map(toScheduleAppointment),
    affectedCount: affected.length,
  });
}));

app.post('/api/admin/appointments/:id/reschedule', apiRoute(async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const appointmentId = req.params.id;
  const body = bodyAsObject(req);

  // Support both single reschedule and batch (via body.changes array)
  const changes: { appointmentId: string; newDoctorId?: string; newDate?: string; newTime: string }[] = [];

  if (Array.isArray(body.changes)) {
    // Batch mode
    for (const change of body.changes) {
      if (typeof change !== 'object' || !change) continue;
      const c = change as Record<string, unknown>;
      changes.push({
        appointmentId: typeof c.appointmentId === 'string' ? c.appointmentId : appointmentId,
        newDoctorId: typeof c.doctorId === 'string' ? c.doctorId : typeof c.newDoctorId === 'string' ? c.newDoctorId : undefined,
        newDate: typeof c.date === 'string' ? c.date : typeof c.newDate === 'string' ? c.newDate : undefined,
        newTime: requiredString(c.newTime ?? c.time, 'New Time'),
      });
    }
  } else {
    // Single appointment mode
    const apt = await AppointmentRepo.findByIdOrCode(appointmentId);
    if (!apt) throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', 'The appointment was not found.');
    changes.push({
      appointmentId: apt.id,
      newDoctorId: typeof body.doctorId === 'string' ? body.doctorId : typeof body.newDoctorId === 'string' ? body.newDoctorId : undefined,
      newDate: typeof body.date === 'string' ? body.date : typeof body.newDate === 'string' ? body.newDate : undefined,
      newTime: requiredString(body.newTime ?? body.time, 'New Time'),
    });
  }

  // Resolve defaults: if newDoctorId / newDate not given, keep current values.
  const resolvedChanges = [];
  for (const c of changes) {
    const apt = await getAppointmentOrThrow(c.appointmentId);
    resolvedChanges.push({
      appointmentId: apt.id,
      newDoctorId: c.newDoctorId || apt.doctorId,
      newDate: c.newDate ? validatedDate(c.newDate) : apt.date,
      newTime: normaliseTime(c.newTime),
    });
  }

  // Atomic batch: validate ALL then apply ALL.
  const results = await AdminAppointmentService.batchReschedule(resolvedChanges, admin.id);

  res.json({
    message: 'Appointments rescheduled successfully.',
    results: results.map((r) => ({
      appointmentId: r.appointment.code,
      status: 'Rescheduled',
      notificationId: r.notification.id,
      notification: notificationPublicView(r.notification),
    })),
  });
}));

// AI recommendation endpoint (admin only)
app.post('/api/admin/recommend-reschedule', apiRoute(async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const body = bodyAsObject(req);
  const appointmentIds = Array.isArray(body.appointmentIds) ? body.appointmentIds : [];
  const recommendations = await AIRecommendationService.recommendReschedule(appointmentIds as string[]);

  res.json({
    recommendations,
    expectedDisruption: 'Low',
    source: 'deterministic-fallback',
  });
}));

// ---------------------------------------------------------------------------
// Camera & Sensor API (PostgreSQL-backed)
// ---------------------------------------------------------------------------

app.get('/api/admin/cameras', apiRoute(async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const facility = await getCachedFacility();
  if (!facility) return res.json([]);

  const cameras = await CameraRepo.findAll(facility.id);
  res.json(cameras.map((c) => ({
    id: c.id,
    facilityId: c.facilityId,
    name: c.name,
    location: c.location,
    type: c.type,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  })));
}));

app.post('/api/admin/cameras/connect', apiRoute(async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const body = bodyAsObject(req);
  const name = requiredString(body.name, 'Name');
  const location = requiredString(body.location, 'Location');
  const type = requiredString(body.type, 'Type');

  const facility = await getCachedFacilityOrThrow();

  const newCamera = await CameraRepo.create({
    facilityId: facility.id,
    name,
    location,
    type: type as 'webcam' | 'cctv' | 'rtsp',
  });

  res.json({
    id: newCamera.id,
    facilityId: newCamera.facilityId,
    name: newCamera.name,
    location: newCamera.location,
    type: newCamera.type,
    status: newCamera.status,
    createdAt: newCamera.createdAt.toISOString(),
    updatedAt: newCamera.updatedAt.toISOString(),
  });
}));

app.post('/api/admin/cameras/disconnect', apiRoute(async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const body = bodyAsObject(req);
  const cameraId = requiredString(body.cameraId, 'Camera ID');
  const camera = await CameraRepo.findById(cameraId);

  if (!camera) {
    throw new ApiError(404, 'CAMERA_NOT_FOUND', 'Camera not found');
  }

  const updated = await CameraRepo.updateStatus(cameraId, 'disconnected');
  res.json({
    id: updated.id,
    facilityId: updated.facilityId,
    name: updated.name,
    location: updated.location,
    type: updated.type,
    status: updated.status,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
}));

app.get('/api/admin/cameras/:id/status', apiRoute(async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const camera = await CameraRepo.findById(req.params.id);
  if (!camera) throw new ApiError(404, 'CAMERA_NOT_FOUND', 'Camera not found');
  res.json({
    id: camera.id,
    facilityId: camera.facilityId,
    name: camera.name,
    location: camera.location,
    type: camera.type,
    status: camera.status,
    createdAt: camera.createdAt.toISOString(),
    updatedAt: camera.updatedAt.toISOString(),
  });
}));

app.post('/api/admin/cameras/:id/analytics', apiRoute(async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const body = bodyAsObject(req);
  const analyticsEvent = await CameraAnalyticsRepo.create({
    cameraId: req.params.id,
    peopleCount: typeof body.peopleCount === 'number' ? body.peopleCount : 0,
    queueCount: typeof body.queueCount === 'number' ? body.queueCount : 0,
    zoneCounts: typeof body.zoneCounts === 'object' ? body.zoneCounts as any : {},
    densityLevel: typeof body.densityLevel === 'string' ? body.densityLevel as 'Low' | 'Medium' | 'High' : 'Low',
  });

  res.json({
    id: analyticsEvent.id,
    cameraId: analyticsEvent.cameraId,
    timestamp: analyticsEvent.timestamp.toISOString(),
    peopleCount: analyticsEvent.peopleCount,
    queueCount: analyticsEvent.queueCount,
    zoneCounts: analyticsEvent.zoneCounts,
    densityLevel: analyticsEvent.densityLevel,
  });
}));

app.get('/api/admin/cameras/:id/analytics', apiRoute(async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const events = await CameraAnalyticsRepo.findByCameraId(req.params.id, 50);
  res.json(events.map((e) => ({
    id: e.id,
    cameraId: e.cameraId,
    timestamp: e.timestamp.toISOString(),
    peopleCount: e.peopleCount,
    queueCount: e.queueCount,
    zoneCounts: e.zoneCounts,
    densityLevel: e.densityLevel,
  })));
}));

// ---------------------------------------------------------------------------
// Super Admin API (PostgreSQL-backed)
// ---------------------------------------------------------------------------

app.get('/api/super-admin/dashboard', apiRoute(async (req, res) => {
  const superAdmin = await requireSuperAdmin(req, res);
  if (!superAdmin) return;

  // These nine reads are independent of one another. Awaiting them in sequence
  // cost nine round trips to the database region — on a remote Postgres that is
  // seconds of pure latency. Issued together they cost one.
  const [
    facility,
    totalUsers,
    totalAdmins,
    totalSuperAdmins,
    totalDoctors,
    totalServices,
    totalAppointments,
    activeTokens,
    activeCameras,
    recentActivity,
  ] = await Promise.all([
    FacilityRepo.getDefault(),
    prisma.user.count(),
    prisma.user.count({ where: { role: 'ADMIN' } }),
    prisma.user.count({ where: { role: 'SUPER_ADMIN' } }),
    prisma.doctor.count(),
    prisma.service.count(),
    prisma.appointment.count(),
    prisma.token.count({ where: { status: { in: ['Waiting', 'Approaching', 'Serving'] } } }),
    prisma.camera.count({ where: { status: 'connected' } }),
    prisma.auditLog.findMany({
      take: 10,
      orderBy: { occurredAt: 'desc' },
      include: { actor: { select: { name: true, role: true } } },
    }),
  ]);
  const facilityId = facility?.id;

  res.json({
    totalUsers,
    totalAdmins,
    totalSuperAdmins,
    totalDoctors,
    totalServices,
    totalAppointments,
    activeTokens,
    activeCameras,
    recentActivity: recentActivity.map(log => ({
      id: log.id,
      actorName: log.actor?.name || 'System',
      actorRole: log.actorRole,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      outcome: log.outcome,
      timestamp: log.occurredAt.toISOString(),
    }))
  });
}));

app.get('/api/super-admin/users', apiRoute(async (req, res) => {
  const superAdmin = await requireSuperAdmin(req, res);
  if (!superAdmin) return;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' }
  });

  res.json(users);
}));

app.patch('/api/super-admin/users/:id/role', apiRoute(async (req, res) => {
  const superAdmin = await requireSuperAdmin(req, res);
  if (!superAdmin) return;

  const targetUser = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!targetUser) {
    res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
    return;
  }

  if (targetUser.role === 'SUPER_ADMIN') {
    res.status(403).json({ error: 'AUTHORIZATION_DENIED', message: 'Cannot modify SUPER_ADMIN role' });
    return;
  }

  // A super admin cannot change their own role either — that is the only way
  // the last SUPER_ADMIN could be lost, locking everyone out of role management.
  if (targetUser.id === superAdmin.id) {
    res.status(403).json({ error: 'AUTHORIZATION_DENIED', message: 'You cannot change your own role.' });
    return;
  }

  const body = bodyAsObject(req);
  const requested = requiredString(body.role, 'Role').toUpperCase();

  // Allowlist, not a denylist: SUPER_ADMIN is absent by construction, so no
  // typo or future enum addition can accidentally make it assignable here.
  const ASSIGNABLE_ROLES = ['ADMIN', 'MANAGER', 'STAFF', 'DOCTOR', 'VISITOR'] as const;
  if (!(ASSIGNABLE_ROLES as readonly string[]).includes(requested)) {
    await recordAudit({ id: superAdmin.id, role: 'SUPER_ADMIN' }, 'update_user_role', 'user', targetUser.id, 'denied');
    res.status(403).json({
      error: 'AUTHORIZATION_DENIED',
      message: requested === 'SUPER_ADMIN'
        ? 'SUPER_ADMIN cannot be granted through the API. It is assigned only by the server at startup from SUPER_ADMIN_EMAIL.'
        : 'That is not an assignable role.',
      details: { assignable: ASSIGNABLE_ROLES },
    });
    return;
  }
  const newRole = requested as typeof ASSIGNABLE_ROLES[number];

  // Granting DOCTOR has to produce a doctor who can actually work.
  //
  // The role and the Doctor profile were two separate operations, so between
  // them the account sat in a state nothing could serve: every /api/doctor/*
  // route checks for a profile and answered a bare 403, which on screen was an
  // unexplained wall of failures. Observed gaps of 5 and 103 minutes.
  //
  // The profile is created here in the same transaction as the role, with
  // placeholder details a SUPER_ADMIN edits afterwards in the Doctors tab. An
  // existing profile is left exactly as it is — this only fills a hole.
  if (newRole === 'DOCTOR') {
    const existingProfile = await prisma.doctor.findUnique({ where: { userId: targetUser.id } });
    if (!existingProfile) {
      const facility = await getCachedFacilityOrThrow();
      const department = await prisma.department.findFirst({
        where: { facilityId: facility.id },
        orderBy: { name: 'asc' },
      });
      if (!department) {
        res.status(409).json({
          error: 'NO_DEPARTMENT',
          message: 'Create a department before assigning the DOCTOR role — a doctor profile must belong to one.',
        });
        return;
      }

      await prisma.$transaction([
        prisma.user.update({ where: { id: targetUser.id }, data: { role: 'DOCTOR' } }),
        prisma.doctor.create({
          data: {
            name: targetUser.name,
            userId: targetUser.id,
            facilityId: facility.id,
            departmentId: department.id,
            isActive: true,
          },
        }),
      ]);

      invalidateUser(targetUser.id);
      publishEvent({ type: 'doctor.changed', doctorId: targetUser.id, facilityId: facility.id });

      await prisma.auditLog.create({
        data: {
          actorId: superAdmin.id,
          actorRole: 'SUPER_ADMIN',
          action: 'update_user_role',
          targetType: 'user',
          targetId: targetUser.id,
          metadata: { newRole, doctorProfileCreated: true, department: department.name },
        },
      });

      res.json({ id: targetUser.id, name: targetUser.name, email: targetUser.email, role: 'DOCTOR' });
      return;
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id: req.params.id },
    data: { role: newRole },
    select: { id: true, name: true, role: true, email: true }
  });

  // The new role must bite on the very next request, not when a TTL expires.
  invalidateUser(updatedUser.id);

  // Safe audit log for the action
  await prisma.auditLog.create({
    data: {
      actorId: superAdmin.id,
      actorRole: 'SUPER_ADMIN',
      action: 'update_user_role',
      targetType: 'user',
      targetId: updatedUser.id,
      metadata: { newRole }
    }
  });

  res.json(updatedUser);
}));

/**
 * DELETE /api/super-admin/users/:id — remove a user account.
 *
 * Soft delete. The row stays so that tokens, appointments and audit entries
 * that reference this person still resolve — a hard delete would either fail on
 * the foreign keys or orphan somebody's clinical history.
 *
 * Three accounts can never be removed, and each refusal says which rule applied
 * rather than a blanket "denied":
 *   - a SUPER_ADMIN, so the role cannot be deleted out of existence
 *   - the caller's own account, the one way to lock everybody out
 *   - a doctor with appointments still ahead of them
 */
app.delete('/api/super-admin/users/:id', apiRoute(async (req, res) => {
  const superAdmin = await requireSuperAdmin(req, res);
  if (!superAdmin) return;

  const target = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: { doctor: { select: { id: true, name: true } } },
  });
  if (!target || target.deletedAt) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'That account no longer exists.');
  }

  if (target.role === 'SUPER_ADMIN') {
    throw new ApiError(403, 'AUTHORIZATION_DENIED',
      'A super admin account cannot be deleted. Change the role first if this account should lose its access.');
  }

  if (target.id === superAdmin.id) {
    throw new ApiError(403, 'AUTHORIZATION_DENIED', 'You cannot delete your own account.');
  }

  // A doctor with people booked in front of them is not a safe delete: those
  // appointments would point at somebody who is gone.
  if (target.doctor) {
    const upcoming = await prisma.appointment.count({
      where: {
        doctorId: target.doctor.id,
        date: { gte: serviceDayKey() },
        status: { notIn: [...TERMINAL_STATUSES] },
        deletedAt: null,
      },
    });
    if (upcoming > 0) {
      throw new ApiError(409, 'DOCTOR_HAS_APPOINTMENTS',
        `${target.name} has ${upcoming} appointment(s) still upcoming. Reassign or cancel them before deleting this account.`);
    }
  }

  const activeToken = await TokenRepo.findActiveForUser(target.id);

  await prisma.$transaction(async (tx) => {
    if (activeToken) {
      // Do not leave them standing in the queue under a deleted account.
      await tx.token.update({
        where: { id: activeToken.id },
        data: { status: 'Cancelled', deletedAt: new Date() },
      });
    }
    if (target.doctor) {
      await tx.doctor.update({ where: { id: target.doctor.id }, data: { isActive: false } });
    }
    await tx.user.update({
      where: { id: target.id },
      data: {
        deletedAt: new Date(),
        // Free the address so the same person can sign up again later.
        email: `deleted+${target.id}@removed.local`,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: superAdmin.id,
        actorRole: 'SUPER_ADMIN',
        action: 'delete_user',
        targetType: 'user',
        targetId: target.id,
        metadata: {
          email: target.email,
          name: target.name,
          role: target.role,
          hadDoctorProfile: !!target.doctor,
          cancelledToken: activeToken?.code ?? null,
        },
      },
    });
  });

  invalidateUser(target.id);
  res.json({ deleted: true, name: target.name, email: target.email });
}));


/**
 * GET /api/super-admin/queue-activity — queue edits made by administrators.
 *
 * This is the Super Admin's notification feed: whenever an admin rewrites a
 * queue entry, the audit record surfaces here with what changed. Edits the
 * Super Admin made themselves are marked so their own actions do not read as
 * something to review.
 */
app.get('/api/super-admin/queue-activity', apiRoute(async (req, res) => {
  const superAdmin = await requireSuperAdmin(req, res);
  if (!superAdmin) return;

  const sinceHours = Math.min(720, Math.max(1, Number(req.query.hours) || 24));
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

  const entries = await prisma.auditLog.findMany({
    where: { action: 'edit_queue_token', occurredAt: { gte: since } },
    orderBy: { occurredAt: 'desc' },
    take: 100,
    include: { actor: { select: { name: true, email: true, role: true } } },
  });

  res.json({
    sinceHours,
    total: entries.length,
    // Anything an administrator other than the viewer changed is worth a look.
    unreviewed: entries.filter((entry) => entry.actorId !== superAdmin.id).length,
    activity: entries.map((entry) => {
      const metadata = (entry.metadata ?? {}) as any;
      return {
        id: entry.id,
        at: entry.occurredAt.toISOString(),
        actorName: entry.actor?.name ?? 'Unknown',
        actorRole: entry.actorRole,
        byYou: entry.actorId === superAdmin.id,
        tokenId: entry.targetId,
        tokenCode: metadata.code ?? null,
        changes: metadata.changes ?? {},
      };
    }),
  });
}));

app.get('/api/super-admin/audit-logs', apiRoute(async (req, res) => {
  const superAdmin = await requireSuperAdmin(req, res);
  if (!superAdmin) return;

  const logs = await prisma.auditLog.findMany({
    take: 100,
    orderBy: { occurredAt: 'desc' },
    include: { actor: { select: { name: true, role: true } } }
  });

  res.json(logs.map(log => ({
    id: log.id,
    actorName: log.actor?.name || 'Unknown',
    actorRole: log.actorRole,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    outcome: log.outcome,
    metadata: log.metadata,
    timestamp: log.occurredAt.toISOString(),
  })));
}));

// ---------------------------------------------------------------------------
// Super Admin — Doctor & Specialization management
// ---------------------------------------------------------------------------
// Only SUPER_ADMIN may create, edit, photograph, or retire a doctor.
// ADMIN/MANAGER get read-only visibility through /api/admin/doctors.

/** Normalises a doctor row into the management DTO the dashboard renders. */
function doctorManagementView(doctor: any) {
  return {
    id: doctor.id,
    name: doctor.name,
    photoUrl: doctor.photoUrl ?? null,
    qualification: doctor.qualification ?? null,
    experienceYears: doctor.experienceYears ?? 0,
    consultationFee: doctor.consultationFee ?? 0,
    bio: doctor.bio ?? null,
    isActive: doctor.isActive ?? true,
    departmentId: doctor.departmentId,
    department: doctor.department ? { id: doctor.department.id, name: doctor.department.name } : null,
    user: doctor.user ? { id: doctor.user.id, email: doctor.user.email, name: doctor.user.name, role: doctor.user.role } : null,
    createdAt: doctor.createdAt,
  };
}

app.get('/api/super-admin/departments', apiRoute(async (req, res) => {
  const viewer = await requireDoctorDirectoryViewer(req, res);
  if (!viewer) return;

  const facility = await getCachedFacility();
  if (!facility) return res.json([]);

  const departments = await DepartmentRepo.findAll(facility.id);
  res.json(departments.map((d) => ({ id: d.id, name: d.name })));
}));

app.post('/api/super-admin/departments', apiRoute(async (req, res) => {
  const superAdmin = await requireSuperAdmin(req, res);
  if (!superAdmin) return;

  const body = bodyAsObject(req);
  const name = requiredString(body.name, 'Specialization name', 80);
  const facility = await getCachedFacilityOrThrow();

  const existing = await prisma.department.findFirst({ where: { facilityId: facility.id, name } });
  if (existing) {
    throw new ApiError(409, 'DEPARTMENT_EXISTS', 'That specialization already exists.');
  }

  const department = await DepartmentRepo.create(facility.id, name);
  invalidateReferenceCache();
  await recordAudit({ id: superAdmin.id, role: 'SUPER_ADMIN' }, 'create_department', 'department', department.id);

  res.json({ id: department.id, name: department.name });
}));

app.get('/api/super-admin/doctors', apiRoute(async (req, res) => {
  const viewer = await requireDoctorDirectoryViewer(req, res);
  if (!viewer) return;

  const facility = await getCachedFacility();
  if (!facility) return res.json([]);

  const doctors = await DoctorRepo.findAllWithUser(facility.id);
  res.json(doctors.map(doctorManagementView));
}));

app.post('/api/super-admin/doctors', apiRoute(async (req, res) => {
  const superAdmin = await requireSuperAdmin(req, res);
  if (!superAdmin) return;

  const body = bodyAsObject(req);
  const name = requiredString(body.name, 'Doctor name', 120);
  const email = requiredString(body.email, 'Doctor email', 180).toLowerCase();
  const departmentId = requiredString(body.departmentId, 'Specialization');
  const qualification = optionalString(body.qualification, 'Qualification', 160);
  const bio = optionalString(body.bio, 'Bio', 500);
  const experienceYears = Math.max(0, Math.min(80, Number(body.experienceYears ?? body.experience ?? 0) || 0));
  const consultationFee = Math.max(0, Math.min(1_000_000, Number(body.consultationFee ?? 0) || 0));

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Enter a valid doctor email address.', { field: 'email' });
  }

  const facility = await getCachedFacilityOrThrow();
  const department = await prisma.department.findFirst({ where: { id: departmentId, facilityId: facility.id } });
  if (!department) {
    throw new ApiError(400, 'UNKNOWN_DEPARTMENT', 'Select an available specialization.', { field: 'departmentId' });
  }

  // Reuse the account when this email already signed in (e.g. via Google) so a
  // doctor never ends up with two profiles.
  let account = await UserRepo.findByEmail(email);
  if (account) {
    const alreadyDoctor = await prisma.doctor.findUnique({ where: { userId: account.id } });
    if (alreadyDoctor) {
      throw new ApiError(409, 'DOCTOR_EXISTS', 'A doctor profile already exists for that email address.');
    }
    if (account.role === 'SUPER_ADMIN') {
      throw new ApiError(403, 'AUTHORIZATION_DENIED', 'A super administrator account cannot be converted into a doctor.');
    }
  }

  const password = optionalString(body.password, 'Initial password', 200);
  if (!account && !password) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'An initial password is required for a new doctor account.', { field: 'password' });
  }
  if (password && password.length < 6) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Password must be at least 6 characters.', { field: 'password' });
  }

  let photoUrl: string | undefined;
  if (body.photo) {
    photoUrl = await storeUploadedImage(body.photo, 'doctors');
  }

  try {
    if (!account) {
      account = await UserRepo.create({
        name,
        email,
        passwordHash: await bcrypt.hash(password as string, PASSWORD_HASH_COST),
        role: 'DOCTOR',
        facilityId: facility.id,
        avatarUrl: photoUrl ?? null,
      });
    } else {
      account = await prisma.user.update({
        where: { id: account.id },
        data: {
          role: 'DOCTOR',
          facilityId: account.facilityId ?? facility.id,
          ...(photoUrl && !account.avatarUrl ? { avatarUrl: photoUrl } : {}),
          ...(password ? { passwordHash: await bcrypt.hash(password, PASSWORD_HASH_COST) } : {}),
        },
      });
    }

    const doctor = await DoctorRepo.create({
      name,
      facilityId: facility.id,
      departmentId,
      userId: account.id,
      photoUrl,
      qualification,
      experienceYears,
      consultationFee,
      bio,
    });

    // The account was just promoted to DOCTOR (and linked to a doctor row).
    invalidateUser(account.id);
    await recordAudit({ id: superAdmin.id, role: 'SUPER_ADMIN' }, 'create_doctor', 'doctor', doctor.id);
    res.json(doctorManagementView({ ...doctor, department }));
  } catch (error) {
    // Never leave an orphaned upload behind if the write failed.
    await deleteStoredImage(photoUrl);
    throw error;
  }
}));

app.patch('/api/super-admin/doctors/:id', apiRoute(async (req, res) => {
  const superAdmin = await requireSuperAdmin(req, res);
  if (!superAdmin) return;

  const existing = await DoctorRepo.findByIdWithUser(req.params.id);
  if (!existing) {
    throw new ApiError(404, 'DOCTOR_NOT_FOUND', 'That doctor could not be found.');
  }

  const body = bodyAsObject(req);
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) updates.name = requiredString(body.name, 'Doctor name', 120);
  if (body.qualification !== undefined) updates.qualification = optionalString(body.qualification, 'Qualification', 160) ?? null;
  if (body.bio !== undefined) updates.bio = optionalString(body.bio, 'Bio', 500) ?? null;
  if (body.experienceYears !== undefined || body.experience !== undefined) {
    updates.experienceYears = Math.max(0, Math.min(80, Number(body.experienceYears ?? body.experience) || 0));
  }
  if (body.consultationFee !== undefined) {
    updates.consultationFee = Math.max(0, Math.min(1_000_000, Number(body.consultationFee) || 0));
  }
  if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);

  if (body.departmentId !== undefined) {
    const departmentId = requiredString(body.departmentId, 'Specialization');
    const department = await prisma.department.findFirst({ where: { id: departmentId, facilityId: existing.facilityId } });
    if (!department) {
      throw new ApiError(400, 'UNKNOWN_DEPARTMENT', 'Select an available specialization.', { field: 'departmentId' });
    }
    updates.departmentId = departmentId;
  }

  let newPhotoUrl: string | undefined;
  if (body.photo) {
    newPhotoUrl = await storeUploadedImage(body.photo, 'doctors');
    updates.photoUrl = newPhotoUrl;
  } else if (body.removePhoto === true) {
    updates.photoUrl = null;
  }

  const doctor = await DoctorRepo.update(existing.id, updates as any);

  // Keep the linked login account's display name in step with the profile.
  if (updates.name && existing.userId) {
    await prisma.user.update({ where: { id: existing.userId }, data: { name: updates.name as string } });
  }

  // The previous file is only removed once the new path is safely committed.
  if ((newPhotoUrl || body.removePhoto === true) && existing.photoUrl && existing.photoUrl !== doctor.photoUrl) {
    await deleteStoredImage(existing.photoUrl);
  }

  await recordAudit({ id: superAdmin.id, role: 'SUPER_ADMIN' }, 'update_doctor', 'doctor', doctor.id);
  res.json(doctorManagementView(doctor));
}));

app.delete('/api/super-admin/doctors/:id', apiRoute(async (req, res) => {
  const superAdmin = await requireSuperAdmin(req, res);
  if (!superAdmin) return;

  const doctor = await DoctorRepo.findByIdWithUser(req.params.id);
  if (!doctor) {
    throw new ApiError(404, 'DOCTOR_NOT_FOUND', 'That doctor could not be found.');
  }

  const appointmentCount = await prisma.appointment.count({ where: { doctorId: doctor.id } });

  // Appointment history must survive, so a doctor with records is retired
  // rather than deleted. Retiring also revokes the DOCTOR login role.
  if (appointmentCount > 0) {
    const retired = await DoctorRepo.update(doctor.id, { isActive: false });
    // Retiring a doctor revokes their DOCTOR role — but never touches a
    // SUPER_ADMIN, so this path can never be used to demote the owner account.
    if (doctor.userId && doctor.user?.role !== 'SUPER_ADMIN') {
      await prisma.user.update({ where: { id: doctor.userId }, data: { role: 'VISITOR' } });
      invalidateUser(doctor.userId);
    }
    await recordAudit({ id: superAdmin.id, role: 'SUPER_ADMIN' }, 'deactivate_doctor', 'doctor', doctor.id);
    return res.json({
      deactivated: true,
      doctor: doctorManagementView(retired),
      message: 'This doctor has appointment history, so the profile was retired instead of deleted.',
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.token.updateMany({ where: { doctorId: doctor.id }, data: { doctorId: null } });
    await tx.doctorAvailability.deleteMany({ where: { doctorId: doctor.id } });
    await tx.doctor.delete({ where: { id: doctor.id } });
    if (doctor.userId && doctor.user?.role !== 'SUPER_ADMIN') {
      await tx.user.update({ where: { id: doctor.userId }, data: { role: 'VISITOR' } });
    }
    if (doctor.userId) invalidateUser(doctor.userId);
  });

  await deleteStoredImage(doctor.photoUrl);
  await recordAudit({ id: superAdmin.id, role: 'SUPER_ADMIN' }, 'delete_doctor', 'doctor', doctor.id);
  res.json({ deleted: true, id: doctor.id });
}));

// ---------------------------------------------------------------------------
// Admin — read-only doctor directory
// ---------------------------------------------------------------------------

app.get('/api/admin/doctors', apiRoute(async (req, res) => {
  const viewer = await requireDoctorDirectoryViewer(req, res);
  if (!viewer) return;

  const facility = await getCachedFacility();
  if (!facility) return res.json({ doctors: [] });

  const doctors = await DoctorRepo.findAllWithUser(facility.id);
  const today = new Date().toISOString().slice(0, 10);

  const withStats = await Promise.all(doctors.map(async (doctor) => {
    const view = doctorManagementView(doctor);
    const counts = await doctorStatCounts(doctor.id, today);
    return { ...view, stats: counts };
  }));

  res.json({ doctors: withStats, canManage: viewer.role === 'SUPER_ADMIN' });
}));

// ---------------------------------------------------------------------------
// Doctor API (Authorized as DOCTOR, restricted to own data)
// ---------------------------------------------------------------------------

/**
 * Per-doctor statistics. Every count is scoped to one doctorId, which callers
 * must resolve from the authenticated session — never from client input.
 */
async function doctorStatCounts(doctorId: string, today: string) {
  const [all, todayAppointments] = await Promise.all([
    prisma.appointment.findMany({
      where: { doctorId, deletedAt: null },
      select: { status: true, date: true },
    }),
    prisma.appointment.findMany({
      where: { doctorId, date: today, deletedAt: null },
      select: { status: true },
    }),
  ]);

  const countBy = (rows: { status: string }[], statuses: readonly string[]) =>
    rows.filter((row) => statuses.includes(row.status)).length;

  const approved = countBy(all, APPROVED_STATUSES);
  const denied = countBy(all, ['Denied']);
  const pending = countBy(all, ['Pending']);

  return {
    // Extended, all-time figures
    totalAppointments: all.length,
    approvedTotal: approved,
    deniedTotal: denied,
    pendingTotal: pending,
    completedCheckups: countBy(all, ['Completed']),
    todayPatients: todayAppointments.length,
    // Pending is excluded from the denominator; no decisions yet means 0%.
    approvalRate: approvalRate(approved, denied),

    // Today's figures — the shape the existing dashboard already renders
    totalToday: todayAppointments.length,
    pending: countBy(todayAppointments, ['Pending']),
    approved: countBy(todayAppointments, APPROVED_STATUSES),
    completed: countBy(todayAppointments, ['Completed']),
    denied: countBy(todayAppointments, ['Denied']),
    missed: countBy(todayAppointments, ['Missed']),
  };
}

app.get('/api/doctor/appointments', apiRoute(async (req, res) => {
  const doctorAuth = await requireDoctor(req, res);
  if (!doctorAuth) return;

  const date = typeof req.query.date === 'string' ? req.query.date : undefined;

  // doctorId comes from the verified session, so a tampered query string
  // cannot widen the result set to another doctor's appointments.
  const where: any = { doctorId: doctorAuth.doctorId, deletedAt: null };
  if (date) {
    where.date = date;
  }

  const appointments = await prisma.appointment.findMany({
    where,
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
  });

  res.json({ appointments });
}));

/**
 * GET /api/doctor/patients — "My Patients".
 * Returns only the patients assigned to the authenticated doctor, with queue
 * position and checkup status. Filtering happens here in the query, not in the UI.
 */
app.get('/api/doctor/patients', apiRoute(async (req, res) => {
  const doctorAuth = await requireDoctor(req, res);
  if (!doctorAuth) return;

  const scope = typeof req.query.scope === 'string' ? req.query.scope : 'today';
  const today = new Date().toISOString().slice(0, 10);

  const where: any = { doctorId: doctorAuth.doctorId, deletedAt: null };
  if (typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
    where.date = req.query.date;
  } else if (scope === 'today') {
    where.date = today;
  } else if (scope === 'upcoming') {
    where.date = { gte: today };
  }

  const appointments = await prisma.appointment.findMany({
    where,
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
      tokens: { select: { id: true, code: true, status: true, counterName: true } },
    },
  });

  // Queue position is the patient's place among that doctor's queued
  // appointments for the same day. A request awaiting approval has no position.
  const positionByDate = new Map<string, number>();

  const patients = appointments.map((apt) => {
    let queuePosition: number | null = null;
    if (isQueueEligible(apt.status)) {
      const next = (positionByDate.get(apt.date) ?? 0) + 1;
      positionByDate.set(apt.date, next);
      queuePosition = next;
    }

    const token = apt.tokens[0];
    return {
      id: apt.id,
      appointmentId: apt.id,
      tokenCode: apt.code,
      patientName: apt.patientName,
      patientUserId: apt.user?.id ?? null,
      patientAvatarUrl: apt.user?.avatarUrl ?? null,
      phoneMasked: maskPhone(apt.phone),
      date: apt.date,
      time: apt.time,
      displayTime: formatTime(apt.time),
      reasonForVisit: apt.reasonForVisit,
      existingDiagnosis: apt.existingDiagnosis ?? null,
      status: apt.status,
      version: apt.version,
      statusReason: apt.statusReason ?? null,
      // Derived from the shared projection, so the doctor, staff, admin and
      // patient views all describe this appointment the same way.
      checkupStatus: toPatientStatus(apt.status),
      queuePosition,
      queueToken: token ? { id: token.id, code: token.code, status: token.status, counterName: token.counterName } : null,
      createdAt: apt.createdAt,
    };
  });

  res.json({ patients, total: patients.length, scope, date: where.date ?? null });
}));

/**
 * GET /api/doctor/queue — live queue tokens for the authenticated doctor only.
 * Shape matches /api/admin/tokens so the existing Live Patient Tracker renders
 * it without any UI change.
 */
app.get('/api/doctor/queue', apiRoute(async (req, res) => {
  const doctorAuth = await requireDoctor(req, res);
  if (!doctorAuth) return;

  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const today = new Date().toISOString().slice(0, 10);

  const doctor = await DoctorRepo.findById(doctorAuth.doctorId);

  // Same queue-eligibility rule as the admin board: an unapproved request or a
  // denied appointment is never in the queue.
  const appointmentWhere: any = {
    doctorId: doctorAuth.doctorId,
    date: today,
    deletedAt: null,
    status: { in: QUEUE_ELIGIBLE_STATUSES as any },
  };
  if (search) {
    appointmentWhere.OR = [
      { patientName: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
    ];
  }

  const appointments = await prisma.appointment.findMany({
    where: appointmentWhere,
    orderBy: { time: 'asc' },
  });

  const appointmentTokens = appointments.map((apt, index) => ({
    id: apt.id,
    // The two halves of this list carry different kinds of identifier. Without
    // saying which, a client cannot know whether `id` addresses a token or an
    // appointment — which is why opening an appointment row asked for a token
    // that does not exist and was told, correctly, that it was not found.
    kind: 'appointment' as const,
    appointmentId: apt.id,
    version: apt.version,
    date: apt.date,
    time: apt.time,
    reasonForVisit: apt.reasonForVisit,
    code: apt.code,
    service: `Dr. ${doctor?.name ?? ''} (${doctor?.department.name ?? 'Consultation'})`,
    patientName: apt.patientName,
    issueTime: formatTime(apt.time),
    estWaitMin: Math.max(0, index * 8),
    peopleAhead: index,
    counterId: `Dr. ${doctor?.name ?? ''}`,
    status: toQueueStatus(apt.status) ?? 'waiting',
    appointmentStatus: apt.status,
    priority: 'Priority',
    demographic: 'Standard',
    urgencyScore: 0,
    fairnessAdjustment: 0,
    checkInMethod: 'Appointment',
  }));

  // Walk-in tokens explicitly routed to this doctor.
  const walkInWhere: any = {
    doctorId: doctorAuth.doctorId,
    deletedAt: null,
    status: { in: ['Waiting', 'Approaching', 'Serving'] },
  };
  if (search) {
    walkInWhere.OR = [
      { visitorName: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
    ];
  }

  const tokens = await prisma.token.findMany({
    where: walkInWhere,
    include: { service: true },
    orderBy: { issuedAt: 'asc' },
  });

  const walkInTokens = tokens.map((t, index) => ({
    id: t.id,
    kind: 'token' as const,
    code: t.code,
    service: t.service.name,
    patientName: displayVisitorName(t.visitorName, t.code),
    issueTime: t.issuedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    estWaitMin: Math.max(t.service.estimatedWaitMinutes, Math.ceil(index * 1.7)),
    peopleAhead: index,
    counterId: t.counterName || t.service.defaultCounterName || 'Unassigned',
    status: t.status.toLowerCase(),
    priority: 'Normal',
    demographic: 'Standard',
    urgencyScore: 0,
    fairnessAdjustment: 0,
    checkInMethod: 'Kiosk',
  }));

  res.json({ tokens: [...walkInTokens, ...appointmentTokens] });
}));

/** The denial reasons a doctor may choose from. Served so the UI cannot drift. */

/**
 * GET /api/doctor/appointments/:id/slots — free times for rescheduling.
 *
 * Scoped to the signed-in doctor's own appointments. The doctor's current slot
 * is excluded from the occupancy check, so their existing time still appears as
 * choosable rather than looking taken by themselves.
 */
app.get('/api/doctor/appointments/:id/slots', apiRoute(async (req, res) => {
  const doctorAuth = await requireDoctor(req, res);
  if (!doctorAuth) return;

  const appointment = await AppointmentRepo.findByIdOrCode(req.params.id);
  if (!appointment || appointment.doctorId !== doctorAuth.doctorId) {
    throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', 'That appointment is not on your schedule.');
  }

  const date = typeof req.query.date === 'string' ? validatedDate(req.query.date) : appointment.date;
  const availableTimes = await availableTimesForDoctor(doctorAuth.doctorId, date, appointment.id);
  res.json({ date, availableTimes: availableTimes.map(formatTime) });
}));

/**
 * POST /api/doctor/appointments/:id/reschedule — move one of my appointments.
 *
 * A doctor could approve or deny but never move an appointment, so the only way
 * to shift their own clinic was to ask an administrator. This is the same act
 * the admin route performs, narrowed to appointments the caller actually owns:
 * the doctor is resolved from the session, the appointment must already belong
 * to them, and the doctorId is never taken from the request — so this cannot be
 * used to move a colleague's patient or hand one to somebody else.
 */
app.post('/api/doctor/appointments/:id/reschedule', apiRoute(async (req, res) => {
  const doctorAuth = await requireDoctor(req, res);
  if (!doctorAuth) return;
  if (!enforceRateLimit(req, res, 'doctor-reschedule', 30, 60_000)) return;

  const appointment = await AppointmentRepo.findByIdOrCode(req.params.id);
  if (!appointment || appointment.doctorId !== doctorAuth.doctorId) {
    throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', 'That appointment is not on your schedule.');
  }

  if ((TERMINAL_STATUSES as readonly string[]).includes(appointment.status)) {
    throw new ApiError(409, 'APPOINTMENT_CLOSED',
      `This appointment is ${appointment.status.toLowerCase()} and cannot be moved.`);
  }

  const body = bodyAsObject(req);
  const newTime = normaliseTime(requiredString(body.newTime ?? body.time, 'New time'));
  const newDate = body.date || body.newDate ? validatedDate(String(body.date ?? body.newDate)) : appointment.date;

  await assertBookableSlot(doctorAuth.doctorId, newDate, newTime, appointment.id);

  const results = await AdminAppointmentService.batchReschedule(
    [{ appointmentId: appointment.id, newDoctorId: doctorAuth.doctorId, newDate, newTime }],
    doctorAuth.userId,
  );
  const result = results[0];

  publishEvent({
    type: 'appointment.status',
    appointmentId: appointment.id,
    status: result.appointment.status,
    doctorId: doctorAuth.doctorId,
    facilityId: appointment.facilityId,
  });

  res.json({
    appointment: {
      id: result.appointment.id,
      code: result.appointment.code,
      date: result.appointment.date,
      time: formatTime(result.appointment.time),
      status: result.appointment.status,
      version: result.appointment.version,
    },
    notification: notificationPublicView(result.notification),
  });
}));

app.get('/api/doctor/denial-reasons', apiRoute(async (req, res) => {
  const doctorAuth = await requireDoctor(req, res);
  if (!doctorAuth) return;
  res.json({ reasons: DENIAL_REASONS });
}));

app.get('/api/doctor/stats', apiRoute(async (req, res) => {
  const doctorAuth = await requireDoctor(req, res);
  if (!doctorAuth) return;

  const today = new Date().toISOString().slice(0, 10);
  const stats = await doctorStatCounts(doctorAuth.doctorId, today);

  res.json({ stats });
}));

/** GET /api/doctor/me — the signed-in doctor's own profile. */
app.get('/api/doctor/me', apiRoute(async (req, res) => {
  const doctorAuth = await requireDoctor(req, res);
  if (!doctorAuth) return;

  const doctor = await DoctorRepo.findByIdWithUser(doctorAuth.doctorId);
  if (!doctor) {
    throw new ApiError(404, 'DOCTOR_NOT_FOUND', 'Your doctor profile could not be found.');
  }
  res.json({ doctor: doctorManagementView(doctor) });
}));

/**
 * PATCH /api/doctor/me — a doctor may edit only their own display fields.
 * Specialization, consultation fee, and account role stay under SUPER_ADMIN.
 */
app.patch('/api/doctor/me', apiRoute(async (req, res) => {
  const doctorAuth = await requireDoctor(req, res);
  if (!doctorAuth) return;

  const existing = await DoctorRepo.findByIdWithUser(doctorAuth.doctorId);
  if (!existing) {
    throw new ApiError(404, 'DOCTOR_NOT_FOUND', 'Your doctor profile could not be found.');
  }

  const body = bodyAsObject(req);
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = requiredString(body.name, 'Name', 120);
  if (body.bio !== undefined) updates.bio = optionalString(body.bio, 'Bio', 500) ?? null;
  if (body.qualification !== undefined) updates.qualification = optionalString(body.qualification, 'Qualification', 160) ?? null;

  let newPhotoUrl: string | undefined;
  if (body.photo) {
    newPhotoUrl = await storeUploadedImage(body.photo, 'doctors');
    updates.photoUrl = newPhotoUrl;
  } else if (body.removePhoto === true) {
    updates.photoUrl = null;
  }

  const doctor = await DoctorRepo.update(existing.id, updates as any);

  if (updates.name) {
    await prisma.user.update({ where: { id: doctorAuth.userId }, data: { name: updates.name as string } });
  }
  if (newPhotoUrl) {
    await prisma.user.update({ where: { id: doctorAuth.userId }, data: { avatarUrl: newPhotoUrl } });
  }
  if ((newPhotoUrl || body.removePhoto === true) && existing.photoUrl && existing.photoUrl !== doctor.photoUrl) {
    await deleteStoredImage(existing.photoUrl);
  }

  invalidateUser(doctorAuth.userId);
  await recordAudit({ id: doctorAuth.userId, role: 'DOCTOR' }, 'update_own_doctor_profile', 'doctor', doctor.id);
  res.json({ doctor: doctorManagementView(doctor) });
}));

app.post('/api/doctor/appointments/:id/status', apiRoute(async (req, res) => {
  const doctorAuth = await requireDoctor(req, res);
  if (!doctorAuth) return;

  const appointmentId = req.params.id;
  const body = bodyAsObject(req);
  const status = normaliseStatus(requiredString(body.status, 'Status'));
  if (!status) {
    throw new ApiError(400, 'INVALID_STATUS', 'Invalid status provided.');
  }

  // Ownership check: the appointment must belong to the authenticated doctor.
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
  });

  if (!appointment) {
    throw new ApiError(404, 'NOT_FOUND', 'Appointment not found.');
  }

  if (appointment.doctorId !== doctorAuth.doctorId) {
    await recordAudit({ id: doctorAuth.userId, role: 'DOCTOR' }, 'update_appointment_status', 'appointment', appointmentId, 'denied');
    throw new ApiError(403, 'AUTHORIZATION_DENIED', 'You can only update your own appointments.');
  }

  // Denials must carry a reason — the patient is told why, rather than just
  // seeing "Declined". `other` requires the doctor's own wording.
  let statusReason: string | null = null;
  if (status === 'Denied') {
    const reasonId = optionalString(body.reasonId, 'Reason', 60);
    const reasonNote = optionalString(body.reasonNote, 'Reason note', 300);
    statusReason = resolveDenialReason(reasonId, reasonNote);
    if (!statusReason) {
      throw new ApiError(400, 'DENIAL_REASON_REQUIRED',
        reasonId === 'other'
          ? 'Write the reason for declining this appointment.'
          : 'Select a reason for declining this appointment.',
        { field: 'reasonId', options: DENIAL_REASONS });
    }
  }

  const updated = await applyAppointmentStatus(
    appointment,
    status,
    { id: doctorAuth.userId, role: 'DOCTOR' },
    body.expectedVersion,
    statusReason,
  );

  // Record audit log
  await recordAudit(
    { id: doctorAuth.userId, role: 'DOCTOR' },
    'update_appointment_status',
    'appointment',
    appointmentId,
    `Status changed to ${status}`
  );

  // Send notifications via email/push if needed
  try {
    const doctor = await prisma.doctor.findUnique({ where: { id: doctorAuth.doctorId }, include: { user: true } });
    if (doctor) {
      const { emailService } = await import('./lib/emailService.js');

      // No contact number means this was booked at the desk. There is nothing
      // to notify, and that is expected — not an error.
      if (!updated.phone) {
        console.log(`ℹ️  ${updated.code} has no phone on file (desk booking); skipping patient notification.`);
      } else if (status === 'Approved') {
        await emailService.notifyPatientApproved(updated.phone, {
          patientName: updated.patientName,
          date: updated.date,
          time: updated.time,
          code: updated.code,
          doctorName: `Dr. ${doctor.name}`
        });
      } else if (status === 'Denied') {
        await emailService.notifyPatientDenied(updated.phone, {
          patientName: updated.patientName,
          date: updated.date,
          time: updated.time,
          code: updated.code,
          doctorName: `Dr. ${doctor.name}`,
          reason: updated.statusReason ?? undefined,
        });
      }
    }
  } catch (err) {
    console.error('Failed to send notification for appointment status update:', err);
  }

  res.json({ appointment: updated });
}));

// ---------------------------------------------------------------------------
// Profile API — any signed-in user manages their own profile
// ---------------------------------------------------------------------------

app.get('/api/profile', apiRoute(async (req, res) => {
  const user = await requireAuthUser(req, res);
  if (!user) return;

  res.json({ user: publicUserView(user, user.doctor?.id) });
}));

/**
 * PATCH /api/profile — display name, phone, and photo only.
 * The user id always comes from the JWT, so one account can never edit another.
 * Email, password, and role are intentionally not editable here.
 */
app.patch('/api/profile', apiRoute(async (req, res) => {
  const user = await requireAuthUser(req, res);
  if (!user) return;

  const body = bodyAsObject(req);
  const updates: { name?: string; phone?: string | null; avatarUrl?: string | null } = {};

  if (body.name !== undefined) updates.name = requiredString(body.name, 'Name', 120);
  if (body.phone !== undefined) updates.phone = validatedPhone(body.phone, false) ?? null;

  let newAvatarUrl: string | undefined;
  if (body.photo) {
    newAvatarUrl = await storeUploadedImage(body.photo, 'avatars');
    updates.avatarUrl = newAvatarUrl;
  } else if (body.removePhoto === true) {
    updates.avatarUrl = null;
  }

  const updated = await UserRepo.updateProfile(user.id, updates);

  // Keep a doctor's directory card in step with their own profile edits.
  if (user.doctor?.id) {
    await prisma.doctor.update({
      where: { id: user.doctor.id },
      data: {
        ...(updates.name ? { name: updates.name } : {}),
        ...(newAvatarUrl ? { photoUrl: newAvatarUrl } : {}),
      },
    });
  }

  // Only drop the old file once the new path is stored, and never a remote
  // (Google-hosted) URL, which is not ours to delete.
  if ((newAvatarUrl || body.removePhoto === true) && user.avatarUrl && user.avatarUrl !== updated.avatarUrl) {
    await deleteStoredImage(user.avatarUrl);
  }

  invalidateUser(user.id);
  await recordAudit({ id: user.id, role: user.role }, 'update_profile', 'user', user.id);
  res.json({ user: publicUserView(updated, user.doctor?.id) });
}));

// ---------------------------------------------------------------------------
// Live updates — Server-Sent Events
// ---------------------------------------------------------------------------

/**
 * GET /api/events — a live stream of queue and appointment changes.
 *
 * Anything that mutates the board publishes to lib/eventBus, and this endpoint
 * forwards those events to connected clients so every screen repaints without
 * waiting for its next poll. Doctors only receive events for their own patients;
 * visitors may follow a single token they hold the access key for.
 */
app.get('/api/events', async (req, res) => {
  // Two ways in: a signed-in account, or a visitor watching one token.
  let role: string | null = null;
  let doctorId: string | null = null;
  let watchTokenId: string | null = null;

  const authHeader = req.header('authorization');
  const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : queryToken;

  if (bearer) {
    try {
      const payload = jwt.verify(bearer, JWT_SECRET) as { userId: string };
      const user = await prisma.user.findFirst({
        where: { id: payload.userId, deletedAt: null },
        include: { doctor: { select: { id: true } } },
      });
      if (user) {
        role = user.role;
        doctorId = user.doctor?.id ?? null;
      }
    } catch {
      // Fall through to the visitor path.
    }
  }

  if (!role) {
    const tokenId = typeof req.query.tokenId === 'string' ? req.query.tokenId : undefined;
    const accessKey = typeof req.query.accessKey === 'string' ? req.query.accessKey : undefined;
    if (tokenId && accessKey) {
      const token = await TokenRepo.findById(tokenId);
      if (token && accessKeyMatches(accessKey, token.accessKeyHash)) {
        watchTokenId = token.id;
      }
    }
    if (!watchTokenId) {
      return res.status(401).json({ error: 'AUTHENTICATION_REQUIRED', message: 'Sign in to receive live updates.' });
    }
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 5000\n\n');
  res.write(`event: ready\ndata: ${JSON.stringify({ role: role ?? 'visitor' })}\n\n`);

  const send = (event: any) => {
    // A doctor is told only about their own patients; a visitor only about the
    // queue they are standing in.
    if (role === 'DOCTOR' && event.doctorId && event.doctorId !== doctorId) return;
    if (watchTokenId && event.type.startsWith('appointment')) return;

    try {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    } catch {
      // The connection went away; the close handler will clean up.
    }
  };

  const unsubscribe = subscribeToEvents(send);

  // Proxies drop idle connections, so send a comment as a keep-alive.
  const heartbeat = setInterval(() => {
    try { res.write(': keep-alive\n\n'); } catch { /* closing */ }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

async function startServer() {
  // Profile image directories must exist before the static handler serves them.
  await ensureUploadDirectories();

  // Verify database connection on startup, and warm the pool + reference cache
  // while doing it. Otherwise the first real requests each pay a TLS handshake
  // and a cold facility/service read — very visible against a remote database.
  try {
    const warmupStart = Date.now();
    // One connection to prove the link, then prime the reference cache. Opening
    // several at once makes a transaction pooler refuse the burst, so the pool
    // is left to grow under real traffic instead.
    await prisma.$queryRaw`SELECT 1`;
    const facility = await getCachedFacility();
    if (facility) await getCachedServices(facility.id);
    console.log(`✅ Database connection verified (pool warmed in ${Date.now() - warmupStart}ms)`);
  } catch (err) {
    console.error('❌ Database connection failed:', err);
    console.error('   Make sure PostgreSQL is running and DATABASE_URL is correct in .env');
    process.exit(1);
  }

  // Close out anything left queueing from an earlier day, then keep checking:
  // a long-running instance has to notice midnight passing, and a free-tier one
  // that sleeps overnight has to catch up the moment it wakes.
  await expireStaleTokens();
  setInterval(() => { void expireStaleTokens(); }, 60 * 60 * 1000).unref();

  // Bootstrap Super Admin from environment variables
  if (process.env.SUPER_ADMIN_EMAIL && process.env.SUPER_ADMIN_PASSWORD) {
    try {
      const existing = await prisma.user.findUnique({
        where: { email: process.env.SUPER_ADMIN_EMAIL }
      });
      const hash = await bcrypt.hash(process.env.SUPER_ADMIN_PASSWORD, PASSWORD_HASH_COST);
      if (!existing) {
        await prisma.user.create({
          data: {
            email: process.env.SUPER_ADMIN_EMAIL,
            name: 'System Super Admin',
            passwordHash: hash,
            role: 'SUPER_ADMIN'
          }
        });
        console.log(`✅ Bootstrapped SUPER_ADMIN account: ${process.env.SUPER_ADMIN_EMAIL}`);
      } else {
        // The role is repaired on every boot — the super admin must never lose
        // it. The PASSWORD is not.
        //
        // Overwriting it here meant the account's password was decided by
        // whichever process started last: the deployed instance and any local
        // server pointed at the same database would each reset it to their own
        // env value, and a password changed in the app was silently reverted on
        // the next restart. Recovery is still possible, but it has to be asked
        // for: set SUPER_ADMIN_PASSWORD_RESET=true for one boot, then remove it.
        const resetRequested = process.env.SUPER_ADMIN_PASSWORD_RESET === 'true';

        if (existing.role !== 'SUPER_ADMIN') {
          await prisma.user.update({
            where: { email: process.env.SUPER_ADMIN_EMAIL },
            data: { role: 'SUPER_ADMIN' },
          });
          console.log(`✅ Restored SUPER_ADMIN role for: ${process.env.SUPER_ADMIN_EMAIL}`);
        }

        if (resetRequested) {
          const isMatch = await bcrypt.compare(process.env.SUPER_ADMIN_PASSWORD, existing.passwordHash);
          if (!isMatch) {
            await prisma.user.update({
              where: { email: process.env.SUPER_ADMIN_EMAIL },
              data: { passwordHash: hash },
            });
            console.log(
              `✅ Reset SUPER_ADMIN password for ${process.env.SUPER_ADMIN_EMAIL} ` +
              '(SUPER_ADMIN_PASSWORD_RESET was set — remove it now so the next restart does not repeat this).',
            );
          }
        }
      }
    } catch (err) {
      console.error('❌ Failed to bootstrap SUPER_ADMIN:', err);
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled Server Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 QueueMind backend is running on http://0.0.0.0:${PORT}`);
  });

  // ============================================================================
  // QueueMind Smart Queue Notification System (Background Worker)
  // ============================================================================

  const notifiedTokens = new Map<string, Set<string>>();

  setInterval(async () => {
    try {
      // Find active tokens that have a phone number attached
      const activeTokens = await prisma.token.findMany({
        where: {
          status: { in: ['Waiting', 'Approaching', 'Serving'] },
          deletedAt: null,
          phone: { not: null }
        },
        include: { service: true }
      });

      for (const t of activeTokens) {
        if (!t.phone) continue;

        const metrics = await tokenMetrics(t);
        const estWait = metrics.estimatedWaitMinutes;

        let stages = notifiedTokens.get(t.id);
        if (!stages) {
          stages = new Set<string>();
          notifiedTokens.set(t.id, stages);
        }

        // Called / Next
        if (t.status === 'Serving' && !stages.has('called')) {
          console.log(`\n[SMS SENT TO ${t.phone}]: Your token ${t.code} is now being called. Please proceed to ${t.counterName || 'your counter'}.`);
          stages.add('called');
        }
        // 10 minute warning
        else if (estWait <= 10 && !stages.has('10m') && t.status !== 'Serving') {
          console.log(`\n[SMS SENT TO ${t.phone}]: Your QueueMind token ${t.code} is coming soon. Please stay near the service area.`);
          stages.add('10m');
        }
        // 20 minute warning
        else if (estWait <= 20 && !stages.has('20m') && t.status !== 'Serving') {
          console.log(`\n[SMS SENT TO ${t.phone}]: Your QueueMind token ${t.code} is approaching. Please start making your way to the counter. Estimated wait: ~${estWait} minutes.`);
          stages.add('20m');
        }
      }
    } catch (error) {
      console.error('Queue notification worker error:', error);
    }
  }, 15000); // Check every 15 seconds for prototype fidelity

}

startServer();

