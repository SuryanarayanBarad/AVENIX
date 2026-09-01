/**
 * ---------------------------------------------------------------------------
 * Ranking doctors for a recommendation
 * ---------------------------------------------------------------------------
 *
 * "Suggested department: Cardiology" is only half an answer. The patient needs
 * to know which cardiologist to see, and the honest ordering is not
 * alphabetical: it depends on who is actually on shift, how long their queue
 * already is, and whether they are running late.
 *
 * The score is deliberately a small, readable weighted sum rather than anything
 * learned. Every component is a real measurement, every weight is visible here,
 * and each result carries the reasons that produced it — so a patient sees
 * "available now, 2 waiting" rather than a rank they cannot interrogate.
 *
 * Import-free so it can be unit-tested and shared with the browser.
 */

export type DoctorAvailabilityStatus = 'Available' | 'Busy' | 'Delayed' | 'Unavailable' | 'OnLeave';

export interface RankableDoctor {
  id: string;
  name: string;
  departmentId: string;
  departmentName: string;
  qualification?: string | null;
  experienceYears?: number;
  consultationFee?: number;
  isActive: boolean;
  /** Today's status, if the schedule says anything. */
  status?: DoctorAvailabilityStatus | null;
  /** Minutes behind schedule, when known. */
  delayMinutes?: number | null;
  /** People already waiting for this doctor today. */
  queueDepth: number;
  /** Free appointment slots left today. */
  freeSlotsToday: number;
}

export interface RankedDoctor extends RankableDoctor {
  score: number;
  /** Minutes a patient joining now can expect to wait for this doctor. */
  estimatedWaitMinutes: number;
  /** Plain-language reasons, in the order they mattered. */
  reasons: string[];
  /** False when nothing about today's schedule is known. */
  scheduleKnown: boolean;
}

/** Typical consultation length, used to turn a queue depth into minutes. */
export const MINUTES_PER_CONSULTATION = 12;

/**
 * Weights. Availability dominates on purpose: a shorter queue is worthless if
 * the doctor is not in today, and recommending an absent doctor is the single
 * most annoying way this feature could fail.
 */
const WEIGHTS = {
  available: 100,
  delayed: 40,
  busy: 55,
  unknownSchedule: 30,
  /** Subtracted per person already waiting. */
  perQueuedPatient: 6,
  /** Subtracted per 10 minutes of running delay. */
  perTenMinutesLate: 8,
  /** Small nudge so experience breaks ties without dominating them. */
  perExperienceYear: 0.8,
  maxExperienceBonus: 12,
  /** Having slots left matters more than having many. */
  hasFreeSlots: 15,
} as const;

function availabilityScore(doctor: RankableDoctor): { points: number; reason: string; known: boolean } {
  switch (doctor.status) {
    case 'Available':
      return { points: WEIGHTS.available, reason: 'Available today', known: true };
    case 'Busy':
      return { points: WEIGHTS.busy, reason: 'In consultation', known: true };
    case 'Delayed':
      return {
        points: WEIGHTS.delayed,
        reason: doctor.delayMinutes ? `Running ${doctor.delayMinutes} min late` : 'Running late',
        known: true,
      };
    case 'Unavailable':
    case 'OnLeave':
      return { points: 0, reason: 'Not available today', known: true };
    default:
      // No row for today is not the same as being away. Say so rather than
      // guessing in either direction.
      return { points: WEIGHTS.unknownSchedule, reason: 'Schedule not published for today', known: false };
  }
}

/** Wait for somebody joining this doctor's queue now. */
export function estimateWait(doctor: RankableDoctor): number {
  return doctor.queueDepth * MINUTES_PER_CONSULTATION + Math.max(0, doctor.delayMinutes ?? 0);
}

/**
 * Rank doctors for a department.
 *
 * Doctors who are inactive or explicitly away today are dropped entirely — a
 * recommendation the patient cannot act on is worse than a shorter list.
 */
export function rankDoctors(
  doctors: RankableDoctor[],
  options: { departmentId?: string | null; limit?: number } = {},
): RankedDoctor[] {
  const { departmentId, limit = 5 } = options;

  const eligible = doctors.filter((d) => {
    if (!d.isActive) return false;
    if (d.status === 'Unavailable' || d.status === 'OnLeave') return false;
    if (departmentId && d.departmentId !== departmentId) return false;
    return true;
  });

  const ranked = eligible.map((doctor) => {
    const availability = availabilityScore(doctor);
    const reasons: string[] = [availability.reason];

    let score = availability.points;

    score -= doctor.queueDepth * WEIGHTS.perQueuedPatient;
    if (doctor.queueDepth === 0) reasons.push('No one waiting');
    else reasons.push(`${doctor.queueDepth} waiting`);

    if (doctor.delayMinutes && doctor.delayMinutes > 0) {
      score -= (doctor.delayMinutes / 10) * WEIGHTS.perTenMinutesLate;
    }

    if (doctor.freeSlotsToday > 0) {
      score += WEIGHTS.hasFreeSlots;
      reasons.push(`${doctor.freeSlotsToday} slot${doctor.freeSlotsToday === 1 ? '' : 's'} left today`);
    } else {
      reasons.push('Fully booked today');
    }

    const years = doctor.experienceYears ?? 0;
    if (years > 0) {
      score += Math.min(WEIGHTS.maxExperienceBonus, years * WEIGHTS.perExperienceYear);
      reasons.push(`${years} yrs experience`);
    }

    return {
      ...doctor,
      score: Number(score.toFixed(2)),
      estimatedWaitMinutes: estimateWait(doctor),
      reasons,
      scheduleKnown: availability.known,
    };
  });

  return ranked
    .sort((a, b) =>
      // Score first; a shorter wait breaks a tie; then a stable name order so
      // the same inputs always produce the same list.
      b.score - a.score
      || a.estimatedWaitMinutes - b.estimatedWaitMinutes
      || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * Match a department name the model returned against the facility's real list.
 *
 * The model is given the catalogue and asked to pick from it, but it may still
 * answer "Cardiology Department" or "cardiology". Exact match first, then a
 * containment check both ways; anything else returns null and the caller shows
 * the suggestion as unmatched rather than silently routing the patient to a
 * department that has nothing to do with it.
 */
export function matchDepartment<T extends { id: string; name: string }>(
  suggested: string | null | undefined,
  departments: T[],
): T | null {
  if (!suggested) return null;
  const needle = suggested.trim().toLowerCase();
  if (!needle) return null;

  const exact = departments.find((d) => d.name.trim().toLowerCase() === needle);
  if (exact) return exact;

  const contained = departments.find((d) => {
    const name = d.name.trim().toLowerCase();
    return needle.includes(name) || name.includes(needle);
  });
  return contained ?? null;
}
