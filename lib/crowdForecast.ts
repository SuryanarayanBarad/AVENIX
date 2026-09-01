/**
 * ---------------------------------------------------------------------------
 * Crowd forecasting
 * ---------------------------------------------------------------------------
 *
 * Pure functions over real observations. Nothing here invents a number, and
 * nothing here is called a model that is not one.
 *
 * What this actually is: a deterministic fluid approximation of a queue. Given
 * an arrival rate λ and a service rate μ measured from the last hour of real
 * tokens, the queue Δ minutes from now is
 *
 *     Q(t+Δ) = max(0, Q(t) + (λ − μ)·Δ + scheduled(Δ))
 *
 * plus the appointments already booked into that window, which are known
 * arrivals rather than estimated ones. Waiting time follows from Little's Law,
 * W = Q/μ.
 *
 * This is a standard operational forecast, and it is the honest ceiling on what
 * this data supports. There is no trained model here and none is claimed: the
 * facility has weeks of history, not years, and no labelled surge events. When
 * the observation window is too thin to estimate a rate at all, the result says
 * so — `basis: 'insufficient-data'` — and the caller shows the current queue
 * rather than a projection dressed up as a prediction.
 *
 * Kept free of imports so it can be unit-tested directly and reused by the
 * browser if a screen ever needs to recompute locally.
 */

export interface ArrivalObservation {
  /** When the person joined the queue. */
  issuedAt: Date;
  serviceId: string;
}

export interface CompletionObservation {
  /** When they left it — served or otherwise closed out. */
  completedAt: Date;
  serviceId: string;
}

export interface ScheduledArrival {
  /** 'HH:MM' in facility-local time. */
  time: string;
  serviceId: string | null;
}

export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';
export type ForecastBasis = 'observed' | 'thin-data' | 'insufficient-data';

export interface HorizonForecast {
  /** Minutes ahead. */
  minutes: number;
  /** Projected number waiting at that point. */
  projectedQueue: number;
  /** Arrivals expected in the window: estimated + already booked. */
  expectedArrivals: number;
  /** Of those, how many are appointments already on the books. */
  scheduledArrivals: number;
  /** Projected wait for somebody joining then, in minutes. */
  projectedWaitMinutes: number;
  risk: RiskLevel;
}

export interface CrowdForecast {
  /** How far the numbers can be trusted, stated rather than implied. */
  basis: ForecastBasis;
  /** Plain-language explanation of that basis, for display. */
  basisNote: string;
  /** Minutes of history the rates were measured over. */
  observationWindowMinutes: number;
  /** People waiting right now. */
  currentQueue: number;
  /** Arrivals per minute, measured. */
  arrivalRatePerMin: number;
  /** Departures per minute, measured. */
  serviceRatePerMin: number;
  /** Positive means the queue is growing. */
  netGrowthPerMin: number;
  /** Current wait for somebody joining now. */
  currentWaitMinutes: number;
  horizons: HorizonForecast[];
  /** The worst risk across all horizons — what an operator reacts to. */
  peakRisk: RiskLevel;
  recommendations: Recommendation[];
}

export interface Recommendation {
  /** Stable identifier so the UI can act on it. */
  id: string;
  /** Ordering for display; 1 is most urgent. */
  priority: number;
  action: string;
  reason: string;
  /** What the operator is expected to do, if anything. */
  actionable: boolean;
}

/** Horizons the product asks for. */
export const FORECAST_HORIZONS = [15, 30, 60] as const;

/**
 * Below this many observed arrivals, a rate is noise. Six in an hour is one
 * every ten minutes — enough to see a trend, not enough to be confident, which
 * is why it maps to 'thin-data' rather than straight to 'observed'.
 */
const MIN_ARRIVALS_FOR_RATE = 6;
const MIN_ARRIVALS_FOR_CONFIDENCE = 15;

/**
 * Risk thresholds, expressed in projected WAIT rather than queue length.
 *
 * A queue of 30 is fine with six counters open and a crisis with one, so
 * counting people alone would raise alarms in a busy-but-coping clinic and stay
 * silent in a stalled one. Wait time already folds in capacity.
 */
const RISK_WAIT_THRESHOLDS: { level: RiskLevel; minWaitMinutes: number }[] = [
  { level: 'critical', minWaitMinutes: 60 },
  { level: 'high', minWaitMinutes: 35 },
  { level: 'moderate', minWaitMinutes: 20 },
  { level: 'low', minWaitMinutes: 0 },
];

export function riskForWait(waitMinutes: number): RiskLevel {
  for (const band of RISK_WAIT_THRESHOLDS) {
    if (waitMinutes >= band.minWaitMinutes) return band.level;
  }
  return 'low';
}

const RISK_ORDER: RiskLevel[] = ['low', 'moderate', 'high', 'critical'];
export function worstRisk(levels: RiskLevel[]): RiskLevel {
  return levels.reduce<RiskLevel>(
    (worst, level) => (RISK_ORDER.indexOf(level) > RISK_ORDER.indexOf(worst) ? level : worst),
    'low',
  );
}

/** Count observations falling inside the window ending at `now`. */
function countWithin(times: Date[], now: Date, windowMinutes: number): number {
  const cutoff = now.getTime() - windowMinutes * 60_000;
  return times.filter((t) => t.getTime() >= cutoff && t.getTime() <= now.getTime()).length;
}

/** Minutes from midnight for an 'HH:MM' or 'H:MM AM' string; null if unparsable. */
export function minutesOfDay(time: string): number | null {
  const trimmed = time.trim();
  const ampm = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(trimmed);
  if (ampm) {
    let hour = Number(ampm[1]) % 12;
    if (/PM/i.test(ampm[3])) hour += 12;
    return hour * 60 + Number(ampm[2]);
  }
  const iso = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (iso) return Number(iso[1]) * 60 + Number(iso[2]);
  return null;
}

/**
 * Produce a forecast from observations.
 *
 * @param now              the moment to forecast from
 * @param currentQueue     people waiting right now
 * @param arrivals         when people joined, over the observation window
 * @param completions      when people left, over the same window
 * @param scheduled        appointments already booked for today
 * @param nowMinutesOfDay  facility-local clock position, for placing `scheduled`
 * @param windowMinutes    how far back the rates are measured
 */
export function forecastCrowd(input: {
  now: Date;
  currentQueue: number;
  arrivals: ArrivalObservation[];
  completions: CompletionObservation[];
  scheduled: ScheduledArrival[];
  nowMinutesOfDay: number;
  windowMinutes?: number;
}): CrowdForecast {
  const windowMinutes = input.windowMinutes ?? 60;
  const { now, currentQueue } = input;

  const arrivalTimes = input.arrivals.map((a) => a.issuedAt);
  const completionTimes = input.completions.map((c) => c.completedAt);

  const arrivalsInWindow = countWithin(arrivalTimes, now, windowMinutes);
  const completionsInWindow = countWithin(completionTimes, now, windowMinutes);

  const arrivalRatePerMin = arrivalsInWindow / windowMinutes;

  /**
   * Service rate needs a floor. With nobody completed in the window — a quiet
   * morning, or a counter that has not opened — μ is 0, and dividing by it
   * makes every wait infinite. One person every ten minutes is a deliberately
   * pessimistic stand-in that keeps the arithmetic finite and the estimate
   * conservative rather than alarming.
   */
  const measuredServiceRate = completionsInWindow / windowMinutes;
  const serviceRatePerMin = Math.max(measuredServiceRate, 0.1);

  let basis: ForecastBasis;
  let basisNote: string;
  if (arrivalsInWindow >= MIN_ARRIVALS_FOR_CONFIDENCE) {
    basis = 'observed';
    basisNote = `Measured from ${arrivalsInWindow} arrivals in the last ${windowMinutes} minutes.`;
  } else if (arrivalsInWindow >= MIN_ARRIVALS_FOR_RATE) {
    basis = 'thin-data';
    basisNote = `Based on only ${arrivalsInWindow} arrivals in the last ${windowMinutes} minutes — treat as indicative.`;
  } else {
    basis = 'insufficient-data';
    basisNote = `Too few arrivals (${arrivalsInWindow}) in the last ${windowMinutes} minutes to project a trend. Showing the current queue only.`;
  }

  const currentWaitMinutes = Math.round(currentQueue / serviceRatePerMin);

  const horizons: HorizonForecast[] = FORECAST_HORIZONS.map((minutes) => {
    // Appointments booked into this window are known arrivals, not guessed
    // ones — the single most reliable input available, and the one a pure
    // rate-based projection misses entirely.
    const windowStart = input.nowMinutesOfDay;
    const windowEnd = windowStart + minutes;
    const scheduledArrivals = input.scheduled.filter((s) => {
      const at = minutesOfDay(s.time);
      return at !== null && at > windowStart && at <= windowEnd;
    }).length;

    // With too little data to estimate λ, project nothing: hold the queue flat
    // and add only what is actually booked. Extrapolating from three arrivals
    // would be inventing a trend.
    const estimatedArrivals = basis === 'insufficient-data'
      ? 0
      : Math.round(arrivalRatePerMin * minutes);

    const departures = serviceRatePerMin * minutes;
    const projectedQueue = Math.max(
      0,
      Math.round(currentQueue + estimatedArrivals + scheduledArrivals - departures),
    );
    const projectedWaitMinutes = Math.round(projectedQueue / serviceRatePerMin);

    return {
      minutes,
      projectedQueue,
      expectedArrivals: estimatedArrivals + scheduledArrivals,
      scheduledArrivals,
      projectedWaitMinutes,
      risk: riskForWait(projectedWaitMinutes),
    };
  });

  const peakRisk = worstRisk([riskForWait(currentWaitMinutes), ...horizons.map((h) => h.risk)]);

  return {
    basis,
    basisNote,
    observationWindowMinutes: windowMinutes,
    currentQueue,
    arrivalRatePerMin: Number(arrivalRatePerMin.toFixed(3)),
    serviceRatePerMin: Number(serviceRatePerMin.toFixed(3)),
    netGrowthPerMin: Number((arrivalRatePerMin - serviceRatePerMin).toFixed(3)),
    currentWaitMinutes,
    horizons,
    peakRisk,
    recommendations: [],
  };
}

/**
 * Turn a forecast into things an operator can actually do.
 *
 * Every recommendation names the number that produced it, so a supervisor can
 * disagree with the reasoning rather than just the conclusion. Nothing here is
 * generated by a language model — these are threshold rules over measured
 * values, and the UI must not label them as AI.
 */
export function recommendationsFor(
  forecast: CrowdForecast,
  context: {
    /** Counters currently serving. */
    openCounters: number;
    /** Counters configured but idle. */
    idleCounters: number;
    /** Busiest service, for naming in the advice. */
    busiestService?: string | null;
    /** A service with spare capacity patients could be moved to. */
    quietService?: string | null;
  },
): Recommendation[] {
  const out: Recommendation[] = [];
  const worst = forecast.horizons.reduce((a, b) => (b.projectedWaitMinutes > a.projectedWaitMinutes ? b : a));

  if (forecast.basis === 'insufficient-data') {
    out.push({
      id: 'observe',
      priority: 1,
      action: 'No action needed yet',
      reason: forecast.basisNote,
      actionable: false,
    });
    return out;
  }

  if (worst.risk === 'critical' || worst.risk === 'high') {
    if (context.idleCounters > 0) {
      out.push({
        id: 'open-counter',
        priority: 1,
        action: `Open another counter (${context.idleCounters} idle)`,
        reason: `Wait is projected to reach ${worst.projectedWaitMinutes} min in ${worst.minutes} min, with ${worst.projectedQueue} people queueing.`,
        actionable: true,
      });
    } else {
      out.push({
        id: 'no-spare-counter',
        priority: 1,
        action: 'Reassign staff — no idle counter available',
        reason: `Wait is projected to reach ${worst.projectedWaitMinutes} min in ${worst.minutes} min and all ${context.openCounters} counters are already serving.`,
        actionable: true,
      });
    }
  }

  if (forecast.netGrowthPerMin > 0 && worst.risk !== 'low') {
    const doubling = forecast.netGrowthPerMin > 0
      ? Math.round(forecast.currentQueue / forecast.netGrowthPerMin)
      : null;
    out.push({
      id: 'growing-queue',
      priority: 2,
      action: context.quietService
        ? `Redirect walk-ins to ${context.quietService}`
        : 'Slow intake or add capacity',
      reason: `Arrivals (${forecast.arrivalRatePerMin.toFixed(2)}/min) exceed throughput (${forecast.serviceRatePerMin.toFixed(2)}/min)`
        + (doubling && doubling > 0 && Number.isFinite(doubling)
          ? `; the queue doubles in about ${doubling} min at this rate.`
          : '.'),
      actionable: true,
    });
  }

  const scheduledPressure = forecast.horizons.find((h) => h.scheduledArrivals >= 5);
  if (scheduledPressure) {
    out.push({
      id: 'booked-surge',
      priority: 3,
      action: 'Prepare for booked arrivals',
      reason: `${scheduledPressure.scheduledArrivals} appointments are booked in the next ${scheduledPressure.minutes} min`
        + (context.busiestService ? `, on top of the queue at ${context.busiestService}.` : '.'),
      actionable: true,
    });
  }

  if (out.length === 0) {
    out.push({
      id: 'steady',
      priority: 1,
      action: 'No action needed',
      reason: `Throughput (${forecast.serviceRatePerMin.toFixed(2)}/min) is keeping up with arrivals (${forecast.arrivalRatePerMin.toFixed(2)}/min).`,
      actionable: false,
    });
  }

  return out.sort((a, b) => a.priority - b.priority);
}
