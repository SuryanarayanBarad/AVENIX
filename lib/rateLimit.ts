/**
 * ---------------------------------------------------------------------------
 * Rate limiting for public write endpoints
 * ---------------------------------------------------------------------------
 * Token creation and appointment booking are deliberately open — a walk-in
 * patient must not need an account. That also means they are reachable by
 * anyone on the internet once deployed, and a loop hitting them would fill the
 * queue with junk rows and skew every wait estimate.
 *
 * The limits below are sized for the real users: a shared lobby kiosk serves
 * roughly one person every half minute, so a handful per minute from one
 * address is generous. They are not an anti-DDoS measure — they stop casual
 * flooding and accidental double-submits from a retry loop.
 *
 * In-memory on purpose: the app runs as a single process, so a shared store
 * would add a dependency for no gain. If it is ever scaled to several
 * instances, this needs moving to Redis or the database.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Periodically drop expired buckets so the map cannot grow unbounded. */
let sweeper: NodeJS.Timeout | null = null;
function ensureSweeper() {
  if (sweeper) return;
  sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, 60_000);
  // Never hold the process open just for cleanup.
  sweeper.unref?.();
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller may try again. */
  retryAfter: number;
  remaining: number;
}

/**
 * Consume one unit from `key`'s bucket.
 * @param limit   requests allowed per window
 * @param windowMs  window length in milliseconds
 */
export function consume(key: string, limit: number, windowMs: number): RateLimitResult {
  ensureSweeper();
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0, remaining: limit - 1 };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      remaining: 0,
    };
  }

  bucket.count += 1;
  return { allowed: true, retryAfter: 0, remaining: limit - bucket.count };
}

/** Clears all buckets. Used by tests. */
export function resetRateLimits(): void {
  buckets.clear();
}
