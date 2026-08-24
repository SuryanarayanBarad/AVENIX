/**
 * Shared response handling for every API client.
 *
 * The point is diagnosability: when a call fails, the thrown Error says what
 * actually happened (status code, server message, or "not JSON") instead of a
 * generic "request failed" that hides a 404 from a stale server build.
 */

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/** Attaches the session JWT when one is stored. */
export const authHeaders = (): Record<string, string> => {
  try {
    const token = window.localStorage.getItem('auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
};

const describe = (status: number, fallback: string): string => {
  if (status === 401) return 'Your session has expired. Sign in again to continue.';
  if (status === 403) return 'You do not have permission to do that.';
  if (status === 404) return `${fallback} (not found — if you just updated the app, restart the server so the new routes load).`;
  if (status === 413) return 'That upload is too large.';
  if (status >= 500) return `${fallback} (server error ${status}). Check the server log for details.`;
  return `${fallback} (HTTP ${status}).`;
};

/**
 * Parses a fetch Response, throwing ApiRequestError with a useful message.
 * `fallback` describes the action, e.g. "Could not save the doctor".
 */
export const parseResponse = async <T>(response: Response, fallback: string): Promise<T> => {
  const raw = await response.text();

  let payload: any = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      // An HTML body means the route did not match the API at all.
      if (!response.ok) {
        throw new ApiRequestError(describe(response.status, fallback), response.status);
      }
      throw new ApiRequestError(
        `${fallback}: the server returned an unexpected response. Restart the server if it is running an older build.`,
        response.status,
      );
    }
  }

  if (!response.ok) {
    const message = payload?.message || payload?.error;
    throw new ApiRequestError(message || describe(response.status, fallback), response.status, payload?.error);
  }

  return payload as T;
};

/**
 * How long to wait before giving up on a request.
 *
 * Generous on purpose: a free-tier host that has gone to sleep can take the
 * better part of a minute to answer its first request. Without any limit a
 * stalled connection leaves the UI spinning forever with no way to recover —
 * which is worse than a clear failure the user can retry.
 */
export const REQUEST_TIMEOUT_MS = 45_000;

/** fetch + parseResponse in one call, with JSON, auth headers and a timeout. */
export const apiFetch = async <T>(
  path: string,
  { fallback = 'The request failed', auth = true, timeoutMs = REQUEST_TIMEOUT_MS, ...init }:
    RequestInit & { fallback?: string; auth?: boolean; timeoutMs?: number } = {},
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(auth ? authHeaders() : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new ApiRequestError(
        `${fallback}: the server did not respond in time. It may be waking up — wait a moment and try again.`,
        0,
      );
    }
    throw new ApiRequestError(`${fallback}: could not reach the server. Check your connection and try again.`, 0);
  } finally {
    clearTimeout(timer);
  }

  return parseResponse<T>(response, fallback);
};
