/**
 * Estimated Time Returned — person-minutes recovered by an intervention.
 * Spec §14. This number is always an ESTIMATE derived from the counterfactual
 * simulator; it is never a measurement.
 */
import type { SimulationResult } from "../types.js";

/** UI label. Never "measured", never "human time saved". */
export const ESTIMATED_TIME_RETURNED_LABEL = "Estimated time returned";

/**
 * Person-minutes of waiting that the optimized scenario avoids relative to the
 * baseline. Clamped at zero — an intervention never "returns" negative time.
 */
export function estimateMinutesReturned(
  baseline: SimulationResult,
  optimized: SimulationResult,
): number {
  return Math.max(
    0,
    baseline.totalPersonMinutesWaiting - optimized.totalPersonMinutesWaiting,
  );
}

/** `42 min` under an hour, `4h 06m` at or above. */
export function formatMinutesReturned(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 min";

  const wholeMinutes = Math.round(minutes);
  if (wholeMinutes < 60) return `${wholeMinutes} min`;

  const hours = Math.floor(wholeMinutes / 60);
  const remainder = wholeMinutes % 60;
  return `${hours}h ${String(remainder).padStart(2, "0")}m`;
}

/** Sums estimates across applied interventions for a session total. */
export function sumMinutesReturned(values: number[]): number {
  let total = 0;
  for (const value of values) {
    if (Number.isFinite(value) && value > 0) total += value;
  }
  return total;
}
