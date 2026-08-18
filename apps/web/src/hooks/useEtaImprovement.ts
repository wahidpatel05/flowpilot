"use client";

import { useEffect, useRef, useState } from "react";
import { isWaitImprovement } from "../lib/etaImprovement";

export interface EtaImprovement {
  fromMinutes: number;
  toMinutes: number;
  /** Distinguishes repeat improvements so a CSS animation can restart. */
  atMillis: number;
}

/** How long the "Your wait just got shorter" badge stays on screen. */
const BADGE_DURATION_MS = 5000;

/**
 * Watches the facility's average wait and reports it the moment it drops
 * meaningfully — the moment an applied Intervention actually pays off, not a
 * fixed schedule. Never fires from a null baseline (nothing waiting yet).
 */
export function useEtaImprovement(averageWaitMinutes: number | null): EtaImprovement | null {
  const previousRef = useRef<number | null>(null);
  const [improvement, setImprovement] = useState<EtaImprovement | null>(null);

  useEffect(() => {
    const previous = previousRef.current;
    if (isWaitImprovement(previous, averageWaitMinutes)) {
      setImprovement({
        fromMinutes: previous as number,
        toMinutes: averageWaitMinutes as number,
        atMillis: Date.now(),
      });
    }
    previousRef.current = averageWaitMinutes;
  }, [averageWaitMinutes]);

  useEffect(() => {
    if (improvement === null) return;
    const timer = setTimeout(() => setImprovement(null), BADGE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [improvement]);

  return improvement;
}
