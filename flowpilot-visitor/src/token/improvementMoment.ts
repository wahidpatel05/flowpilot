/**
 * The improvement moment's one decision: did this Visitor's wait just get
 * shorter? Everything downstream — the ETA crossfade, the "wait just got
 * shorter" banner, the success haptic — fires off this single boolean, so it
 * lives in one place rather than three components independently reinventing
 * "is this materially better."
 *
 * Scoped deliberately narrow: only a strictly lower ETA while `waiting` both
 * before and after counts. A transition into or out of `waiting` (e.g. the
 * Token being called) is its own, already-clear status change — celebrating
 * it here too would blur two different moments together.
 */
import type { LiveTokenModel } from "./tokenPresentation";

type EtaComparable = Pick<LiveTokenModel, "status" | "etaMinutes">;

export function didEtaImprove(
  previous: EtaComparable | null,
  next: EtaComparable,
): boolean {
  if (previous === null) return false;
  if (previous.status !== "waiting" || next.status !== "waiting") return false;

  // null means "no open Counter" (Closed) — an unbounded wait, not a number.
  if (previous.etaMinutes === null) return next.etaMinutes !== null;
  if (next.etaMinutes === null) return false;

  return next.etaMinutes < previous.etaMinutes;
}
