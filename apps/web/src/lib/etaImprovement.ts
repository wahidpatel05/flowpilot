/** Minimum drop, in minutes, before a wait-time change counts as "shorter" — filters out noise. */
export const MIN_IMPROVEMENT_MINUTES = 1;

/**
 * Whether the average wait meaningfully dropped between two readings. Null on
 * either side (nobody waiting) never counts as an improvement — there is
 * nothing to compare against.
 */
export function isWaitImprovement(
  previousMinutes: number | null,
  currentMinutes: number | null,
): boolean {
  if (previousMinutes === null || currentMinutes === null) return false;
  if (!Number.isFinite(previousMinutes) || !Number.isFinite(currentMinutes)) return false;
  return previousMinutes - currentMinutes >= MIN_IMPROVEMENT_MINUTES;
}
