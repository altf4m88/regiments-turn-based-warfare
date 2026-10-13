import { useEffect, useState } from 'react';

/**
 * Phones and small tablets in either orientation: narrower than a laptop, or as
 * short as a phone held sideways.
 */
export const COMPACT_QUERY = '(max-width: 1023px), (max-height: 560px)';

const matches = () => typeof window !== 'undefined' && !!window.matchMedia?.(COMPACT_QUERY).matches;

/** Whether to use the compact layout; follows rotation and window resizes. */
export function useCompact() {
  const [compact, setCompact] = useState(matches);
  useEffect(() => {
    const mq = window.matchMedia?.(COMPACT_QUERY);
    if (!mq) return;
    const update = () => setCompact(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return compact;
}

/** Read once at startup, e.g. to start with the side panels closed on a phone. */
export const startsCompact = matches;
