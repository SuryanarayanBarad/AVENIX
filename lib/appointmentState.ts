/**
 * ---------------------------------------------------------------------------
 * Appointment lifecycle — the authoritative state machine
 * ---------------------------------------------------------------------------
 *
 * Like ./permissions.ts this module has NO imports, so the server and the React
 * app share one definition of "what state is this appointment in, and what may
 * it become". Every queue listing and every status badge derives from the
 * projections below, which is what keeps the doctor, staff, admin and patient
 * screens from disagreeing about the same appointment.
 *
 *   Pending ──approve──→ Approved ──→ CheckedIn ──→ Waiting ──→ InConsultation ──→ Completed
 *      │                    │             │            │              │
 *      └──deny──→ Denied    └──→ Cancelled / Missed / Delayed ────────┘
 */

export type AppointmentStatus =
  | 'Pending'
  | 'Approved'
  | 'Denied'
  | 'Scheduled'
  | 'CheckedIn'
  | 'Waiting'
  | 'InConsultation'
  | 'Completed'
  | 'Delayed'
  | 'Cancelled'
  | 'Missed';

/** Nothing leaves these states. */
export const TERMINAL_STATUSES: AppointmentStatus[] = ['Completed', 'Denied', 'Cancelled', 'Missed'];

/**
 * Legal moves. `Scheduled` is retained as a legacy alias of `Approved` for rows
 * written before approval existed, so historical data keeps flowing.
 */
export const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  Pending: ['Approved', 'Denied', 'Cancelled'],
  // A doctor may start a consultation directly — skipping the desk check-in is
  // ordinary practice, not a data-integrity problem. What is blocked is
  // completing an appointment nobody approved.
  Approved: ['CheckedIn', 'Waiting', 'InConsultation', 'Delayed', 'Cancelled', 'Missed'],
  Scheduled: ['Approved', 'CheckedIn', 'Waiting', 'InConsultation', 'Delayed', 'Cancelled', 'Missed'],
  CheckedIn: ['Waiting', 'InConsultation', 'Delayed', 'Cancelled', 'Missed'],
  Waiting: ['InConsultation', 'Delayed', 'Cancelled', 'Missed'],
  InConsultation: ['Completed', 'Delayed'],
  Delayed: ['CheckedIn', 'Waiting', 'InConsultation', 'Cancelled', 'Missed'],
  Completed: [],
  Denied: [],
  Cancelled: [],
  Missed: [],
};

/** Display labels the UI may send, mapped onto the enum. */
export const STATUS_ALIASES: Record<string, AppointmentStatus> = {
  'Checked In': 'CheckedIn',
  'In Consultation': 'InConsultation',
  'Awaiting approval': 'Pending',
};

const ALL_STATUSES = Object.keys(APPOINTMENT_TRANSITIONS) as AppointmentStatus[];

/** Accepts an enum value or a display label; returns null for anything else. */
export function normaliseStatus(input: unknown): AppointmentStatus | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  const alias = STATUS_ALIASES[trimmed];
  if (alias) return alias;
  return (ALL_STATUSES as string[]).includes(trimmed) ? (trimmed as AppointmentStatus) : null;
}

export function isTerminal(status: AppointmentStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  if (from === to) return true; // Re-sending the current state is a no-op, not an error.
  return APPOINTMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Human-readable reason a move was refused, for the API error body. */
export function transitionError(from: AppointmentStatus, to: AppointmentStatus): string | null {
  if (canTransition(from, to)) return null;
  if (isTerminal(from)) {
    return `This appointment is already ${describeStatus(from).toLowerCase()} and can no longer be changed.`;
  }
  const allowed = APPOINTMENT_TRANSITIONS[from];
  return allowed.length
    ? `An appointment that is ${describeStatus(from).toLowerCase()} can only move to: ${allowed.join(', ')}.`
    : `An appointment that is ${describeStatus(from).toLowerCase()} cannot be changed.`;
}

// ---------------------------------------------------------------------------
// Projections — every screen derives its label from these, never inline maps
// ---------------------------------------------------------------------------

/**
 * States that put a patient in the live queue.
 * `Pending` is excluded on purpose: an unapproved request belongs in the
 * doctor's Requests list, not in anybody's queue.
 */
export const QUEUE_ELIGIBLE_STATUSES: AppointmentStatus[] = [
  'Approved',
  'Scheduled',
  'CheckedIn',
  'Waiting',
  'InConsultation',
  'Delayed',
];

export function isQueueEligible(status: AppointmentStatus | string): boolean {
  return (QUEUE_ELIGIBLE_STATUSES as string[]).includes(status);
}

export type QueueStatus = 'waiting' | 'approaching' | 'serving';

/** The queue-board projection shared by the admin, staff and doctor queues. */
export function toQueueStatus(status: AppointmentStatus | string): QueueStatus | null {
  switch (status) {
    case 'Approved':
    case 'Scheduled':
    case 'Delayed':
      return 'waiting';
    case 'CheckedIn':
    case 'Waiting':
      return 'approaching';
    case 'InConsultation':
      return 'serving';
    default:
      return null;
  }
}

export type TokenStatus = 'Waiting' | 'Approaching' | 'Serving' | 'Completed' | 'Cancelled';

/**
 * The queue-token projection: how an appointment reads when it is shown next to
 * walk-in tokens (patient queue view, kiosk boards). Same underlying state as
 * `toQueueStatus`, expressed in the Token model's vocabulary.
 */
export function toTokenStatus(status: AppointmentStatus | string): TokenStatus {
  switch (status) {
    case 'CheckedIn':
    case 'Waiting':
      return 'Approaching';
    case 'InConsultation':
      return 'Serving';
    case 'Completed':
      return 'Completed';
    case 'Denied':
    case 'Cancelled':
    case 'Missed':
      return 'Cancelled';
    default:
      return 'Waiting';
  }
}

/** Patient-facing wording. Deliberately plain language, no enum names. */
export function toPatientStatus(status: AppointmentStatus | string): string {
  switch (status) {
    case 'Pending': return 'Awaiting approval';
    case 'Approved':
    case 'Scheduled': return 'Confirmed';
    case 'Denied': return 'Declined';
    case 'CheckedIn': return 'Checked in';
    case 'Waiting': return 'Waiting';
    case 'InConsultation': return 'In consultation';
    case 'Completed': return 'Completed';
    case 'Delayed': return 'Delayed';
    case 'Cancelled': return 'Cancelled';
    case 'Missed': return 'Missed';
    default: return 'Scheduled';
  }
}

/** Staff/doctor-facing wording for the same state. */
export function describeStatus(status: AppointmentStatus | string): string {
  switch (status) {
    case 'CheckedIn': return 'Checked in';
    case 'InConsultation': return 'In consultation';
    case 'Pending': return 'Pending approval';
    default: return String(status);
  }
}

/**
 * Reasons a doctor can give when denying a request. The patient sees the label,
 * so each one is written to be readable by them, not just clinically accurate.
 * `other` requires the doctor to type their own note.
 */
export const DENIAL_REASONS: { id: string; label: string }[] = [
  { id: 'unavailable', label: 'Doctor unavailable at this time' },
  { id: 'fully-booked', label: 'Schedule is fully booked' },
  { id: 'wrong-specialty', label: 'Needs a different specialty' },
  { id: 'emergency', label: 'Emergency case took priority' },
  { id: 'more-info', label: 'More patient information needed' },
  { id: 'duplicate', label: 'Duplicate or already-booked request' },
  { id: 'other', label: 'Other (write a reason)' },
];

export const DENIAL_REASON_IDS = DENIAL_REASONS.map((reason) => reason.id);

/** Resolve a reason id (plus free text for `other`) into the stored sentence. */
export function resolveDenialReason(reasonId: string | undefined, note?: string): string | null {
  if (!reasonId) return null;
  const match = DENIAL_REASONS.find((reason) => reason.id === reasonId);
  if (!match) return null;
  if (reasonId === 'other') {
    const trimmed = (note ?? '').trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  const trimmed = (note ?? '').trim();
  return trimmed ? `${match.label} — ${trimmed}` : match.label;
}

/**
 * Statuses that count as an approval when measuring approval rate — an
 * approval that has since moved on to check-in or completion still counts, so
 * the rate does not drift as the day progresses.
 */
export const APPROVED_STATUSES: AppointmentStatus[] = [
  'Approved',
  'Scheduled',
  'CheckedIn',
  'Waiting',
  'InConsultation',
  'Completed',
];

/** Approved / (Approved + Denied) × 100. Pending is excluded; 0 when undecided. */
export function approvalRate(approved: number, denied: number): number {
  const decided = approved + denied;
  if (decided === 0) return 0;
  return Math.round((approved / decided) * 1000) / 10;
}
