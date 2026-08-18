/**
 * The Live Token screen's connection indicator (A4): whether the two Realtime
 * channels useLiveToken opens are actually live, so a Visitor knows whether to
 * trust what's on screen. FR-006's actual data-freshness fallback is the poll
 * in useLiveToken — this only decides what the indicator says, and never
 * gates a refetch.
 *
 * Pure so the decision — "live" needs every channel SUBSCRIBED, not just one —
 * is testable without a Supabase connection.
 */

/** Mirrors @supabase/realtime-js's REALTIME_SUBSCRIBE_STATES, kept as plain strings so this module has no Supabase import. */
export type ChannelSubscribeStatus = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";

export type ConnectionState = "connecting" | "live" | "reconnecting";

/**
 * The caller must pass one slot per channel it opened, `undefined` for a
 * channel that hasn't reported a status yet — never a shorter array. A
 * shorter array (e.g. only the channels that happen to have reported so
 * far) would let one early SUBSCRIBED report as "live" before every channel
 * has actually confirmed, which is the one thing this function must not do.
 */
export function deriveConnectionState(
  statuses: readonly (ChannelSubscribeStatus | undefined)[],
): ConnectionState {
  if (statuses.length === 0 || statuses.some((status) => status === undefined)) {
    return "connecting";
  }
  return statuses.every((status) => status === "SUBSCRIBED") ? "live" : "reconnecting";
}
