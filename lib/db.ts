/**
 * Prisma Client Singleton
 *
 * Reuses a single PrismaClient instance across hot-reloads in development
 * to avoid exhausting database connections.
 */
import { PrismaClient } from '@prisma/client';

/**
 * Make a Supabase transaction-pooler URL safe for Prisma.
 *
 * Prisma uses prepared statements by default. PgBouncer in transaction mode
 * hands each statement whichever server connection is free, so a statement
 * prepared on one connection is missing on the next — and every model query
 * fails while `$queryRaw` often survives, because it does not go through the
 * same prepared-statement cache. That asymmetry is precisely what a broken
 * deployment looks like: /api/health reports the database connected, and
 * sign-in, doctors and services all return 500.
 *
 * `?pgbouncer=true` tells Prisma to stop preparing statements. The repository's
 * own .env.example documents it as required, which means it can also be
 * forgotten in a hosting dashboard where nobody reads the example file. Adding
 * it here is safe whether or not it was already there: it is a no-op on a
 * correctly-formed URL, and it is only applied to pooler URLs, never to a
 * direct connection where prepared statements are wanted.
 *
 * The URL is never logged — it carries the database password.
 */
function poolerSafeUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    // Port 6543 is Supabase's TRANSACTION pooler, the only mode where prepared
    // statements break. The session pooler on 5432 keeps one server connection
    // per client, so statements survive and disabling them would only cost
    // performance for no benefit.
    if (url.port !== '6543') return raw;
    if (url.searchParams.get('pgbouncer') === 'true') return raw;

    url.searchParams.set('pgbouncer', 'true');
    console.warn(
      '⚠️  DATABASE_URL points at a transaction pooler without ?pgbouncer=true. '
      + 'Adding it: without it Prisma prepares statements that PgBouncer cannot reuse, '
      + 'and every model query fails while /api/health still reports connected.',
    );
    return url.toString();
  } catch {
    // Not a parseable URL — leave it exactly as given and let Prisma report it.
    return raw;
  }
}

const datasourceUrl = poolerSafeUrl(process.env.DATABASE_URL);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(datasourceUrl ? { datasourceUrl } : {}),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
