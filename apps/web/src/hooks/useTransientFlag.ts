"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A boolean that flips true, then back to false on its own after `durationMs`.
 * Used for "this just happened" UI beats (an avatar mood, a badge flash) that
 * a fixed-length CSS animation alone can't drive because React still needs to
 * unmount/reset it.
 */
export function useTransientFlag(durationMs: number): [boolean, () => void] {
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = useCallback(() => {
    setActive(true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setActive(false), durationMs);
  }, [durationMs]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return [active, trigger];
}
