import { useEffect, useState } from 'react';

/**
 * A value that settles rather than tracking every keystroke.
 *
 * Used where a value drives a network request. Typing "cardiology" into a
 * search box fired eleven queue queries — ten of which were already stale
 * before they returned, and whose responses could arrive out of order and show
 * results for a prefix the user had moved past.
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    // Each new keystroke cancels the pending update, so only the pause at the
    // end of typing survives.
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
