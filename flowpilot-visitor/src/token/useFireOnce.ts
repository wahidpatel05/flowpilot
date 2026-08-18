/**
 * Fires `onFire` exactly once per new non-null `key` — the shape every
 * "play the improvement moment" reaction shares (EtaHeadline's crossfade,
 * ImprovementBanner's message, LiveTokenScreen's haptic). One place for the
 * consume-once-by-ref pattern rather than three near-identical copies of it.
 */
import { useEffect, useRef } from "react";

export function useFireOnce(key: number | null, onFire: () => void): void {
  const lastKeyRef = useRef<number | null>(key);
  const onFireRef = useRef(onFire);
  onFireRef.current = onFire;

  useEffect(() => {
    if (key === null || key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    onFireRef.current();
    // onFire is read from a ref so a caller passing a fresh closure each
    // render doesn't re-fire; only a genuinely new key does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
