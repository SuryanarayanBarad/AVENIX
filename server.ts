import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.disable('x-powered-by');
app.use(express.json());

/**
 * --------------------------------------------------------------------------
 * Visitor queue and appointment mock API
 * --------------------------------------------------------------------------
 *
 * This project did not previously have an authentication or persistence
 * layer. The store below is intentionally in-memory, but its boundary mirrors
 * a database-backed service: identifiers are generated on the server,
 * appointment slots have a unique index, and private visitor resources use a
 * one-time capability key. Replace these Maps with repository calls backed by
 * database transactions before deploying to multiple server instances.
 */

type StaffRole = 'staff' | 'manager';
type DoctorStatus = 'Available' | 'Busy' | 'Delayed' | 'Unavailable';
type QueueStatus = 'Waiting' | 'Approaching' | 'Serving' | 'Completed' | 'Cancelled';
type AppointmentStatus = 'Scheduled' | 'Checked In' | 'Waiting' | 'In Consultation' | 'Completed' | 'Delayed' | 'Cancelled';
type NotificationResponse = 'confirmed' | 'request_another_time';

interface VisitorService {
  id: string;
  name: string;
  description: string;
  estimatedWaitMinutes: number;
  peopleWaiting: number;
  defaultCounterName: string | null;
}

interface DoctorRecord {
  id: string;
  name: string;
  department: string;
}

interface QueueTokenRecord {
  id: string;
  code: string;
  facilityId: string;
  serviceId: string;
  visitorName?: string;
  phone?: string;
  issuedAt: string;
  status: QueueStatus;
  counterName: string | null;
  accessKeyHash: string;
}

interface AppointmentRecord {
  id: string;
  code: string;
  facilityId: string;
  doctorId: string;
  patientName: string;
  phone: string;
  date: string;
  time: string;
  reasonForVisit: string;
  existingDiagnosis?: string;
  status: AppointmentStatus;
  accessKeyHash: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

interface DoctorAvailabilityRecord {
  id: string;
  doctorId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: DoctorStatus;
  delayMinutes?: number;
  note?: string;
  updatedAt: string;
  updatedBy: string;
}

interface ScheduleChangeRecord {
  id: string;
  appointmentId: string;
  previousDoctorId: string;
  previousDate: string;
  previousTime: string;
  newDoctorId: string;
  newDate: string;
  newTime: string;
  approvedBy: string;
  approvedAt: string;
}

interface NotificationRecord {
  id: string;
  appointmentId: string;
  type: 'appointment_rescheduled';
  title: string;
  message: string;
  previousTime: string;
  newTime: string;
  channel: 'mock';
  deliveryStatus: 'queued' | 'mock-dispatched' | 'failed';
  recipientPhoneMasked: string;
  createdAt: string;
  dispatchedAt?: string;
  response?: NotificationResponse;
  respondedAt?: string;
}

interface AuditEvent {
  id: string;
  occurredAt: string;
  actorId: string;
  actorRole: StaffRole | 'visitor-capability' | 'system';
  action: string;
  targetType: 'token' | 'appointment' | 'doctor' | 'availability' | 'notification' | 'schedule-change' | 'schedule';
  targetId: string;
  outcome: 'success' | 'denied';
}

interface QueueUpdateEvent {
  id: string;
  occurredAt: string;
  topic: 'token.updated' | 'appointment.updated' | 'notification.created';
  resourceId: string;
  payload: Record<string, unknown>;
}

interface NotificationDispatcher {
  dispatch(notification: NotificationRecord): { status: 'mock-dispatched'; dispatchedAt: string };
}

/**
 * Adapter seam for a future SMS/WhatsApp/email/push provider. The mock never
 * transmits a phone number and makes dispatch observable through its status.
 */
class MockNotificationDispatcher implements NotificationDispatcher {
  dispatch(): { status: 'mock-dispatched'; dispatchedAt: string } {
    return { status: 'mock-dispatched', dispatchedAt: new Date().toISOString() };
  }
}

const notificationDispatcher: NotificationDispatcher = new MockNotificationDispatcher();

const visitorServices: VisitorService[] = [
  {
    id: 'general-consultation',
    name: 'General Consultation',
    description: 'General health concerns and triage',
    estimatedWaitMinutes: 12,
    peopleWaiting: 7,
    defaultCounterName: null,
  },
  {
    id: 'registration',
    name: 'Registration',
    description: 'New patient registration and records',
    estimatedWaitMinutes: 5,
    peopleWaiting: 2,
    defaultCounterName: 'Counter 05',
  },
  {
    id: 'billing',
    name: 'Billing',
    description: 'Payments, insurance, and discharge billing',
    estimatedWaitMinutes: 8,
    peopleWaiting: 4,
    defaultCounterName: 'Counter 06',
  },
  {
    id: 'pharmacy',
    name: 'Pharmacy',
    description: 'Prescription collection and medicines',
    estimatedWaitMinutes: 18,
    peopleWaiting: 11,
    defaultCounterName: 'Counter 03',
  },
  {
    id: 'diagnostics',
    name: 'Diagnostics',
    description: 'Lab tests, scans, and sample collection',
    estimatedWaitMinutes: 15,
    peopleWaiting: 8,
    defaultCounterName: null,
  },
  {
    id: 'other',
    name: 'Other Services',
    description: 'Get help with another available facility service',
    estimatedWaitMinutes: 10,
    peopleWaiting: 3,
    defaultCounterName: null,
  },
];

const doctors: DoctorRecord[] = [
  { id: 'dr-sharma', name: 'Dr. Sharma', department: 'General Medicine' },
  { id: 'dr-iyer', name: 'Dr. Iyer', department: 'Pediatrics' },
  { id: 'dr-khan', name: 'Dr. Khan', department: 'Cardiology' },
  { id: 'dr-mehta', name: 'Dr. Mehta', department: 'Diagnostics' },
];

/**
 * All mutating operations below are synchronous from validation through index
 * update. That makes their check-and-insert atomic in this single-process mock
 * (even when HTTP requests arrive together). A production repository must use
 * the same constraints inside a database transaction.
 */
const queueStore = {
  facilityId: 'citycare-hospital',
  nextWalkInNumber: 184,
  nextAppointmentNumber: 2841,
  tokens: new Map<string, QueueTokenRecord>(),
  appointments: new Map<string, AppointmentRecord>(),
  appointmentBySlot: new Map<string, string>(),
  availability: new Map<string, DoctorAvailabilityRecord>(),
  scheduleChanges: new Map<string, ScheduleChangeRecord>(),
  notifications: new Map<string, NotificationRecord>(),
  auditEvents: [] as AuditEvent[],
  updates: [] as QueueUpdateEvent[],
};

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

const apiRoute = (handler: (req: express.Request, res: express.Response) => void | Promise<void>) =>
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

function recordAudit(
  actor: { id: string; role: AuditEvent['actorRole'] },
  action: AuditEvent['action'],
  targetType: AuditEvent['targetType'],
  targetId: string,
  outcome: AuditEvent['outcome'] = 'success',
): AuditEvent {
  const event: AuditEvent = {
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    actorId: actor.id,
    actorRole: actor.role,
    action,
    targetType,
    targetId,
    outcome,
  };
  queueStore.auditEvents.unshift(event);
  // Keep the mock bounded and avoid retaining operational metadata forever.
  if (queueStore.auditEvents.length > 500) queueStore.auditEvents.length = 500;
  return event;
}

function publishUpdate(
  topic: QueueUpdateEvent['topic'],
  resourceId: string,
  payload: Record<string, unknown>,
): void {
  queueStore.updates.unshift({
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    topic,
    resourceId,
    payload,
  });
  if (queueStore.updates.length > 500) queueStore.updates.length = 500;
}

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

function slotKey(doctorId: string, date: string, time: string): string {
  return `${doctorId}:${date}:${time}`;
}

function availabilityKey(doctorId: string, date: string, startTime: string, endTime: string): string {
  return `${doctorId}:${date}:${startTime}:${endTime}`;
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

function requireAdmin(req: express.Request, res: express.Response): { id: string; role: StaffRole } | null {
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

function findService(serviceId: string): VisitorService {
  const service = visitorServices.find((candidate) => candidate.id === serviceId);
  if (!service) throw new ApiError(400, 'UNKNOWN_SERVICE', 'Select an available service.', { field: 'serviceId' });
  return service;
}

function findDoctor(doctorId: string): DoctorRecord {
  const doctor = doctors.find((candidate) => candidate.id === doctorId);
  if (!doctor) throw new ApiError(404, 'DOCTOR_NOT_FOUND', 'The selected doctor was not found.');
  return doctor;
}

function getTokenOrThrow(tokenId: string): QueueTokenRecord {
  const token = queueStore.tokens.get(tokenId);
  if (!token) throw new ApiError(404, 'TOKEN_NOT_FOUND', 'The token was not found.');
  return token;
}

function getAppointmentOrThrow(appointmentId: string): AppointmentRecord {
  const appointment = queueStore.appointments.get(appointmentId);
  if (!appointment) throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', 'The appointment was not found.');
  return appointment;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `••••••${digits.slice(-4)}`;
}

function activeQueueCount(serviceId: string): number {
  let count = 0;
  for (const token of queueStore.tokens.values()) {
    if (token.serviceId === serviceId && (token.status === 'Waiting' || token.status === 'Approaching')) count += 1;
  }
  return count;
}

function tokenMetrics(token: QueueTokenRecord): { peopleAhead: number; estimatedWaitMinutes: number } {
  const service = findService(token.serviceId);
  // The mock starts with non-identifying aggregate queue depth; issued tokens
  // are then reflected in the live count without exposing any patient data.
  const peopleAhead = Math.max(0, service.peopleWaiting + activeQueueCount(token.serviceId) - 1);
  return {
    peopleAhead,
    estimatedWaitMinutes: Math.max(service.estimatedWaitMinutes, Math.ceil(peopleAhead * 1.7)),
  };
}

function toPublicToken(token: QueueTokenRecord): Record<string, unknown> {
  const service = findService(token.serviceId);
  const metrics = tokenMetrics(token);
  return {
    id: token.id,
    code: token.code,
    serviceName: service.name,
    peopleAhead: metrics.peopleAhead,
    estimatedWaitMinutes: metrics.estimatedWaitMinutes,
    status: token.status,
    counterName: token.counterName,
    issuedAt: token.issuedAt,
  };
}

function toVisitorAppointment(appointment: AppointmentRecord): Record<string, unknown> {
  const doctor = findDoctor(appointment.doctorId);
  return {
    id: appointment.id,
    appointmentId: appointment.code,
    code: appointment.code,
    doctor: doctor.name,
    doctorId: doctor.id,
    department: doctor.department,
    date: appointment.date,
    time: formatTime(appointment.time),
    patientName: appointment.patientName,
    maskedPhone: maskPhone(appointment.phone),
    status: appointment.status,
  };
}

function toStaffAppointment(appointment: AppointmentRecord): Record<string, unknown> {
  const doctor = findDoctor(appointment.doctorId);
  return {
    ...toVisitorAppointment(appointment),
    phone: appointment.phone,
    reasonForVisit: appointment.reasonForVisit,
    existingDiagnosis: appointment.existingDiagnosis,
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt,
    version: appointment.version,
  };
}

function activeAppointment(appointment: AppointmentRecord): boolean {
  return appointment.status !== 'Completed' && appointment.status !== 'Cancelled';
}

function doctorAvailabilityForDate(doctorId: string, date: string): DoctorAvailabilityRecord[] {
  return [...queueStore.availability.values()]
    .filter((item) => item.doctorId === doctorId && item.date === date)
    .sort((left, right) => timeToMinutes(left.startTime) - timeToMinutes(right.startTime));
}

function doctorStatusForDate(doctorId: string, date: string): DoctorStatus {
  const statuses = doctorAvailabilityForDate(doctorId, date).map((item) => item.status);
  if (statuses.includes('Unavailable')) return 'Unavailable';
  if (statuses.includes('Delayed')) return 'Delayed';
  if (statuses.includes('Busy')) return 'Busy';
  return 'Available';
}

function isDoctorUnavailableAt(doctorId: string, date: string, time: string): boolean {
  return doctorAvailabilityForDate(doctorId, date).some(
    (item) => item.status === 'Unavailable' && timeIsWithin(time, item.startTime, item.endTime),
  );
}

function standardSlots(): string[] {
  const slots: string[] = [];
  for (let minutes = 9 * 60; minutes < 17 * 60; minutes += 30) {
    slots.push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
  }
  return slots;
}

function availableTimesForDoctor(doctorId: string, date: string, excludeAppointmentId?: string): string[] {
  return standardSlots().filter((time) => {
    const indexedAppointmentId = queueStore.appointmentBySlot.get(slotKey(doctorId, date, time));
    return !isDoctorUnavailableAt(doctorId, date, time)
      && (!indexedAppointmentId || indexedAppointmentId === excludeAppointmentId);
  });
}

function assertBookableSlot(doctorId: string, date: string, time: string, excludeAppointmentId?: string): void {
  findDoctor(doctorId);
  if (!standardSlots().includes(time)) {
    throw new ApiError(400, 'INVALID_APPOINTMENT_TIME', 'Select an available 30-minute appointment time.', { field: 'time' });
  }
  if (isDoctorUnavailableAt(doctorId, date, time)) {
    throw new ApiError(409, 'APPOINTMENT_SLOT_UNAVAILABLE', 'The doctor is unavailable at the requested time.', {
      doctorId,
      date,
      time: formatTime(time),
    });
  }
  const existingAppointmentId = queueStore.appointmentBySlot.get(slotKey(doctorId, date, time));
  if (existingAppointmentId && existingAppointmentId !== excludeAppointmentId) {
    throw new ApiError(409, 'APPOINTMENT_SLOT_UNAVAILABLE', 'That doctor already has an appointment at the requested time.', {
      doctorId,
      date,
      time: formatTime(time),
    });
  }
}

function affectedAppointments(doctorId: string, date: string, startTime: string, endTime: string): AppointmentRecord[] {
  return [...queueStore.appointments.values()]
    .filter((appointment) => (
      appointment.doctorId === doctorId
      && appointment.date === date
      && activeAppointment(appointment)
      && timeIsWithin(appointment.time, startTime, endTime)
    ))
    .sort((left, right) => timeToMinutes(left.time) - timeToMinutes(right.time));
}

function createNotification(appointment: AppointmentRecord, previousTime: string, newTime: string): NotificationRecord {
  const doctor = findDoctor(appointment.doctorId);
  const notification: NotificationRecord = {
    id: randomUUID(),
    appointmentId: appointment.id,
    type: 'appointment_rescheduled',
    title: 'APPOINTMENT UPDATED',
    message: `Your appointment with ${doctor.name} has been rescheduled from ${formatTime(previousTime)} to ${formatTime(newTime)}.`,
    previousTime: formatTime(previousTime),
    newTime: formatTime(newTime),
    channel: 'mock',
    deliveryStatus: 'queued',
    recipientPhoneMasked: maskPhone(appointment.phone),
    createdAt: new Date().toISOString(),
  };

  try {
    const delivery = notificationDispatcher.dispatch(notification);
    notification.deliveryStatus = delivery.status;
    notification.dispatchedAt = delivery.dispatchedAt;
  } catch (error) {
    console.error('Mock notification dispatch error:', error);
    notification.deliveryStatus = 'failed';
  }

  queueStore.notifications.set(notification.id, notification);
  publishUpdate('notification.created', appointment.id, {
    notificationId: notification.id,
    title: notification.title,
    deliveryStatus: notification.deliveryStatus,
  });
  return notification;
}

function notificationPublicView(notification: NotificationRecord): Record<string, unknown> {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    previousTime: notification.previousTime,
    newTime: notification.newTime,
    deliveryStatus: notification.deliveryStatus,
    createdAt: notification.createdAt,
    response: notification.response,
  };
}

function toScheduleAppointment(appointment: AppointmentRecord): Record<string, unknown> {
  return {
    id: appointment.id,
    appointmentId: appointment.code,
    patientName: appointment.patientName,
    time: formatTime(appointment.time),
    status: appointment.status,
  };
}

function findNextRecommendedSlot(
  doctorId: string,
  date: string,
  startAt: string,
  reservedKeys: Set<string>,
): string | null {
  return standardSlots().find((time) => (
    timeToMinutes(time) >= timeToMinutes(startAt)
    && !isDoctorUnavailableAt(doctorId, date, time)
    && !queueStore.appointmentBySlot.has(slotKey(doctorId, date, time))
    && !reservedKeys.has(slotKey(doctorId, date, time))
  )) || null;
}

function parseDateQuery(req: express.Request): string {
  const date = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
  return validatedDate(date);
}

// Initialize Gemini Client
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

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

// System prompt for QueueMind Copilot
const COPILOT_SYSTEM_INSTRUCTION = `
You are QueueMind Copilot, an expert AI crowd intelligence and queue optimization assistant for CityCare Hospital.
You have real-time visibility into the hospital's LiDAR and thermal sensor matrix, active service counters, visitor tokens, wait time SLAs, and priority fairness rules.

Current Hospital Operating Context:
- Total Waiting Patients: 147
- Active Counters: 8 (Counter 01 General Triage [High Load: 24 people, 22m wait], Counter 02 Pediatrics [Optimal: 12 people, 14m wait], Counter 03 Pharmacy [Overloaded: 35 people, 28m wait], Counter 04 Specialist [Underutilized: 8 people, 11m wait], Counter 05 Registration [Idle], Counter 06 Billing [Optimal], Counter 07 Emergency [Active], Counter 08 General [Closed/Backup]).
- Zone Densities: Main Waiting Lounge 90% (Critical), Emergency 80%, Pharmacy 85%, Registration 20%, Billing 20%.
- Sensors: 42 Active Nodes (18 LiDAR point-cloud nodes, 24 Thermal privacy-first sensors).
- Fairness Score: 94/100 (Protected elderly 2.0x, pediatric 1.75x, emergency immediate override).

Respond in a concise, authoritative, and data-backed manner.
Whenever applicable, provide:
1. Direct answer with clear statistics
2. Root-cause explanation
3. Recommended actionable step (e.g. Open Counter 05, Reallocate Counter 04 to General Consultation, Dispatch Pharmacy runner)
4. Estimated Impact (e.g. Reduce average wait from 18m to 9m, prevent SLA breach).
Keep responses clear and formatted with markdown bullet points.
`;

// API endpoint for QueueMind Copilot Chat
app.post('/api/copilot/chat', async (req, res) => {
  try {
    const prompt = req.body.prompt || req.body.message;
    const context = req.body.context;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.7-flash',
          contents: `${context ? `Additional Live Telemetry:\n${JSON.stringify(context, null, 2)}\n\n` : ''}User Query: ${prompt}`,
          config: {
            systemInstruction: COPILOT_SYSTEM_INSTRUCTION,
            temperature: 0.7,
          },
        });

        return res.json({
          reply: response.text || 'Recommendation formulated based on sensor telemetries.',
          confidence: 94,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
      } catch (geminiError) {
        console.warn('Gemini API call failed, using intelligent simulation engine:', geminiError);
      }
    }

    // Fallback intelligent reasoning simulation
    const lower = prompt.toLowerCase();
    let reply = '';
    let confidence = 94;
    let reasoningCard: any = null;

    if (lower.includes('which counter') || lower.includes('open counter') || lower.includes('recommendation')) {
      reply = `**Recommendation: Open Counter 05 for General Consultation Overflow**\n\n- **Current Bottleneck:** Counter 01 (General Triage) is at 88% capacity with 24 patients waiting (22m avg wait).\n- **Underutilized Capacity:** Counter 05 (Registration) has zero backlog and staff Ava is currently idle.\n- **Action:** Transition Counter 05 to dual General Consultation / Registration mode.\n- **Simulated Impact:** Average wait drops from **18 mins → 9 mins** (-50% reduction) within 15 minutes of execution.`;
      reasoningCard = {
        title: 'Open Counter 05 (Overflow)',
        confidence: 96,
        recommendation: 'Reassign Counter 05 to General Consultation triage',
        impactWait: '-50% (18m → 9m)',
        impactFairness: '94 → 98 Score',
        actionLabel: 'Apply Counter 05 Reassignment',
        actionKey: 'open_counter_5',
      };
    } else if (lower.includes('20%') || lower.includes('demand') || lower.includes('increase') || lower.includes('surge')) {
      reply = `**Simulated Impact of +20% Demand Surge:**\n\n- **Projected Inflow:** 176 total active patients (up from 147).\n- **Primary Failure Point:** Pharmacy (Counter 03) will exceed 45 min wait time by 11:45 AM.\n- **Mitigation Protocol:** \n  1. Activate Counter 08 (Backup Doctor Alan Morales).\n  2. Enable automated prescription pre-batching for RX tokens.\n  3. Divert mild pediatric triage to Counter 02.\n- **Net Outcome:** Maintains wait times under 15m SLA with 92% fairness retention.`;
      reasoningCard = {
        title: '+20% Surge Mitigation',
        confidence: 92,
        recommendation: 'Activate Counter 08 Backup & Pre-batch Pharmacy',
        impactWait: 'Stabilizes at 14m max',
        impactFairness: 'Maintains 92/100',
        actionLabel: 'Deploy Surge Protocol',
        actionKey: 'deploy_surge',
      };
    } else if (lower.includes('peak') || lower.includes('hours') || lower.includes('arrivals')) {
      reply = `**Today's Peak Inflow Analysis:**\n\n- **Primary Peak:** 11:30 AM – 12:30 PM (Expected peak rate: **86 arrivals/hour**).\n- **Secondary Peak:** 2:30 PM – 3:30 PM (Post-lunch specialist appointments, ~54 arrivals/hour).\n- **LiDAR Crowd Velocity:** Inflow acceleration is currently +12.4% faster than historical baseline for Tuesday mornings.\n- **Proactive Staffing:** Ensure all 8 counters are staffed continuously between 11:15 AM and 1:00 PM.`;
    } else if (lower.includes('priorit') || lower.includes('fairness') || lower.includes('why')) {
      reply = `**QueueMind Fairness Transparency Engine:**\n\nPrioritization decisions are calculated using a multi-factor dynamic score:\n- **Clinical Urgency (10.0x):** Emergency triage (e.g., E-007) immediately bypasses standard queues.\n- **Protected Demographics (2.0x):** Elderly (80+ yrs) and mobility-impaired patients are adjusted +3 to +5 positions to reduce waiting room stress.\n- **Pediatric Fast-Track (1.75x):** Young children under 6 are routed to Counter 02.\n- **Anti-Starvation SLA (1.8x):** Any patient waiting >35 minutes is progressively escalated to prevent wait-time degradation.`;
    } else {
      reply = `**QueueMind Telemetry Summary:**\n\n- **Overall Status:** System is managing 147 active patients with an average wait of 18 minutes.\n- **LiDAR & Thermal Sensors:** 42 active nodes detecting 64% total facility occupancy.\n- **Hotspots:** Main Waiting Lounge (90% capacity) and Pharmacy Dispensing (85% capacity).\n- **Optimization Status:** Real-time dynamic load rebalancing active. All counter adjustments pass fairness parity audit (Score: 94/100).`;
    }

    return res.json({
      reply,
      confidence,
      reasoningCard,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
  } catch (error) {
    console.error('Copilot Chat Error:', error);
    return res.status(500).json({ error: 'Internal copilot processing error' });
  }
});

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
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'QueueMind AI Backend',
    geminiEnabled: !!ai,
    timestamp: new Date().toISOString(),
  });
});

// Vite middleware in dev, static files in prod
async function startServer() {
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`QueueMind AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
