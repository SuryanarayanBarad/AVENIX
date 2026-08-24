/**
 * ---------------------------------------------------------------------------
 * The service day
 * ---------------------------------------------------------------------------
 *
 * A queue token is only meaningful on the day it was issued. Nothing used to
 * say so: a token left Waiting when the clinic closed stayed Waiting forever,
 * so yesterday's unserved visitors kept counting towards "people ahead", kept
 * appearing on the live board, and kept holding the one-active-token-per-user
 * slot. To anyone looking at the screen they were tokens with no owner and no
 * explanation.
 *
 * Everything here is pure and importless so the Express server and the React
 * app can share it, the same way lib/permissions.ts is shared.
 *
 * The boundary is a real local midnight, not UTC midnight: a clinic in
 * Asia/Kolkata that reset its queue at 05:30 would be resetting it in the
 * middle of the morning. Every function takes the zone as an argument;
 * DEFAULT_QUEUE_TIMEZONE below is the single place to change it for the
 * facility. It is not read from the environment, because this module is
 * imported by the browser bundle as well as the server.
 */

export const DEFAULT_QUEUE_TIMEZONE = 'Asia/Kolkata';

/** Statuses that still occupy a place in the queue. */
export const ACTIVE_TOKEN_STATUSES = ['Waiting', 'Approaching', 'Serving'] as const;

/**
 * Wall-clock parts of `at` as observed in `timeZone`.
 *
 * Intl is the only thing in the platform that knows when a zone's offset
 * changes, so DST and historical offsets come out right without a table.
 */
function zonedParts(at: Date, timeZone: string): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return { year: get('year'), month: get('month'), day: get('day') };
}

/**
 * The zone's UTC offset in milliseconds at a given instant.
 *
 * Derived by asking what that instant looks like locally and comparing: the
 * difference is the offset, including whatever DST was in force.
 */
function offsetMs(at: Date, timeZone: string): number {
  const { year, month, day } = zonedParts(at, timeZone);
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = timeFormatter.formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // `hour` can format as 24 at midnight in some locales; normalise it.
  const hour = get('hour') % 24;
  const asUtc = Date.UTC(year, month - 1, day, hour, get('minute'), get('second'));
  // Seconds are the finest granularity here, so drop sub-second noise first.
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant local midnight began, for the day containing `at`. */
export function startOfServiceDay(at: Date = new Date(), timeZone: string = DEFAULT_QUEUE_TIMEZONE): Date {
  try {
    const { year, month, day } = zonedParts(at, timeZone);
    const midnightAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
    return new Date(midnightAsUtc - offsetMs(at, timeZone));
  } catch {
    // An unknown zone must not take the queue down; fall back to UTC midnight.
    const utc = new Date(at);
    utc.setUTCHours(0, 0, 0, 0);
    return utc;
  }
}

/** The `YYYY-MM-DD` label of the service day containing `at`. */
export function serviceDayKey(at: Date = new Date(), timeZone: string = DEFAULT_QUEUE_TIMEZONE): string {
  try {
    const { year, month, day } = zonedParts(at, timeZone);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

/** True when `at` falls on the same service day as `reference`. */
export function isSameServiceDay(
  at: Date,
  reference: Date = new Date(),
  timeZone: string = DEFAULT_QUEUE_TIMEZONE,
): boolean {
  return serviceDayKey(at, timeZone) === serviceDayKey(reference, timeZone);
}

/**
 * A display name for a token that was issued without one.
 *
 * A lobby kiosk deliberately issues anonymous tokens, which is fine — but a
 * blank cell on the board reads as corrupt data rather than as a walk-in who
 * did not give their name. The code is what staff call out, so it belongs here.
 */
export function displayVisitorName(name: string | null | undefined, code?: string | null): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed) return trimmed;
  return code ? `Walk-in ${code}` : 'Walk-in visitor';
}
