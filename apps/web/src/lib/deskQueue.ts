import type { ProjectedQueueEntry } from "./core";

/**
 * The projection's `queue` already holds `waiting` and `called` Tokens in call
 * order (see `projectFacility`) — this file only reads that order, it never
 * re-derives it.
 */

/** The next few waiting Tokens, in queue order, for the Desk's "up next" list. */
export function selectWaitingPreview(
  queue: readonly ProjectedQueueEntry[],
  limit: number,
): ProjectedQueueEntry[] {
  return queue.filter((entry) => entry.status === "waiting").slice(0, limit);
}
