/** Shared "—" / "<1" / rounded-minutes rendering for any ETA-shaped number. */
export function formatWaitMinutes(minutes: number): string {
  if (!Number.isFinite(minutes)) return "—";
  if (minutes < 1) return "<1";
  return Math.round(minutes).toString();
}
