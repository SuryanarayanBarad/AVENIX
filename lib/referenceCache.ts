/**
 * ---------------------------------------------------------------------------
 * Reference-data cache
 * ---------------------------------------------------------------------------
 * Facilities and services are small, near-static tables that almost every
 * request touches — issuing a token reads the service three times, the queue
 * board reads it once per row. Against a remote database each of those is a
 * network round trip, which dominated response times.
 *
 * These are cached in memory for a short TTL. The window is deliberately small
 * so an edit in the dashboard shows up quickly, and any write path can call
 * `invalidateReferenceCache()` to drop it immediately.
 */
import { prisma } from './db.js';

const TTL_MS = 60_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

let facilityCache: CacheEntry<any> | null = null;
let servicesCache: CacheEntry<any[]> | null = null;

const fresh = <T>(entry: CacheEntry<T> | null): entry is CacheEntry<T> =>
  entry !== null && entry.expiresAt > Date.now();

/** The default facility, cached. */
export async function getCachedFacility() {
  if (fresh(facilityCache)) return facilityCache.value;
  const facility = await prisma.facility.findFirst({ orderBy: { createdAt: 'asc' } });
  facilityCache = { value: facility, expiresAt: Date.now() + TTL_MS };
  return facility;
}

/** Every service for a facility, cached as one list. */
export async function getCachedServices(facilityId: string) {
  if (fresh(servicesCache)) return servicesCache.value;
  const services = await prisma.service.findMany({
    where: { facilityId },
    orderBy: { createdAt: 'asc' },
  });
  servicesCache = { value: services, expiresAt: Date.now() + TTL_MS };
  return services;
}

/**
 * One service by id, served from the cached list.
 * Falls back to a direct read so an id created since the last refresh still
 * resolves rather than 404-ing.
 */
export async function getCachedService(serviceId: string) {
  if (fresh(servicesCache)) {
    const hit = servicesCache.value.find((service) => service.id === serviceId);
    if (hit) return hit;
  }
  const facility = await getCachedFacility();
  if (facility) {
    const services = await getCachedServices(facility.id);
    const hit = services.find((service) => service.id === serviceId);
    if (hit) return hit;
  }
  return prisma.service.findUnique({ where: { id: serviceId } });
}

/** Drop the cache after a write that changes facilities or services. */
export function invalidateReferenceCache(): void {
  facilityCache = null;
  servicesCache = null;
}

// ---------------------------------------------------------------------------
// Authenticated-user cache
// ---------------------------------------------------------------------------
/**
 * Every authenticated request re-reads its user row to check the role — one
 * network round trip before any real work. That row is cached here for a very
 * short window.
 *
 * This does NOT weaken authorization:
 *   - the role is still resolved server-side from the database row, never from
 *     the JWT;
 *   - every path that writes a role calls `invalidateUser`, so a promotion or
 *     revocation takes effect on the very next request;
 *   - the TTL is a backstop, so even a missed invalidation self-heals in
 *     seconds rather than persisting.
 */
const USER_TTL_MS = 10_000;

type CachedUser = { id: string; role: string; [key: string]: any } | null;
const userCache = new Map<string, CacheEntry<CachedUser>>();

export function getCachedUser(userId: string): CachedUser | undefined {
  const entry = userCache.get(userId);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    userCache.delete(userId);
    return undefined;
  }
  return entry.value;
}

export function setCachedUser(userId: string, value: CachedUser): void {
  // Bounded so a long-running server cannot grow this without limit.
  if (userCache.size > 5_000) userCache.clear();
  userCache.set(userId, { value, expiresAt: Date.now() + USER_TTL_MS });
}

/** Call after ANY write that changes a user's role, profile, or existence. */
export function invalidateUser(userId: string): void {
  userCache.delete(userId);
}

/** Nuclear option, for writes whose blast radius is unclear. */
export function invalidateAllUsers(): void {
  userCache.clear();
}
