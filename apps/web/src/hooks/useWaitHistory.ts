"use client";

import { useRef, useState } from "react";

const MAX_POINTS = 24;

/**
 * A rolling client-side trend of the facility's average wait, sampled once
 * per live update. Session-only by design — Control has no "today so far"
 * store to read from, and a trend line is more honest restarting empty on
 * refresh than backfilling with a number nobody observed.
 */
export function useWaitHistory(averageWaitMinutes: number | null): readonly number[] {
  const [history, setHistory] = useState<number[]>([]);
  const lastRecorded = useRef<number | null>(null);

  if (averageWaitMinutes !== null && averageWaitMinutes !== lastRecorded.current) {
    lastRecorded.current = averageWaitMinutes;
    setHistory((current) => [...current, averageWaitMinutes].slice(-MAX_POINTS));
  }

  return history;
}
