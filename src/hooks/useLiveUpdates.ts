import { useEffect, useRef } from 'react';

/**
 * Subscribe to the server's live event stream.
 *
 * Anything that changes the queue or an appointment publishes an event, and the
 * callback fires immediately — so a screen repaints the moment somebody else
 * acts, instead of waiting out its polling interval. If the stream is
 * unavailable the caller's own polling still covers it, so this is an
 * accelerator rather than a dependency.
 *
 * Pass `watch` for an anonymous visitor following a single token; signed-in
 * users are identified by their stored session token.
 */
export function useLiveUpdates(
  onEvent: (event: { type: string; [key: string]: any }) => void,
  options: { enabled?: boolean; watch?: { tokenId: string; accessKey: string } | null } = {},
) {
  const { enabled = true, watch = null } = options;
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  const watchKey = watch ? `${watch.tokenId}:${watch.accessKey}` : '';

  useEffect(() => {
    if (!enabled) return;

    const authToken = (() => {
      try { return window.localStorage.getItem('auth_token'); } catch { return null; }
    })();

    // Without either credential there is nothing to subscribe to.
    if (!authToken && !watch) return;

    const params = new URLSearchParams();
    if (authToken) params.set('token', authToken);
    if (watch) {
      params.set('tokenId', watch.tokenId);
      params.set('accessKey', watch.accessKey);
    }

    let source: EventSource | null = null;
    try {
      source = new EventSource(`/api/events?${params.toString()}`);
    } catch {
      return;
    }

    const forward = (event: MessageEvent) => {
      try {
        handlerRef.current(JSON.parse(event.data));
      } catch {
        // A malformed frame is not worth breaking the stream over.
      }
    };

    for (const name of ['token.created', 'token.status', 'appointment.created', 'appointment.status', 'doctor.changed']) {
      source.addEventListener(name, forward as EventListener);
    }

    // EventSource reconnects on its own; nothing to do but stop the noise.
    source.onerror = () => {};

    return () => {
      source?.close();
    };
  }, [enabled, watchKey]);
}
