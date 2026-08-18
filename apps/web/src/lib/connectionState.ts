/**
 * Turns Supabase Realtime channel status events into a UI-facing connection
 * phase, and decides when the page must fall back to polling. Pure and
 * framework-free so it can be unit tested without a browser or a socket.
 *
 * `live`        — the Realtime channel is subscribed; updates arrive by push.
 * `connecting`  — the initial subscribe attempt has not resolved yet.
 * `reconnecting`— a failure occurred, but not enough in a row to give up push.
 * `polling`     — enough consecutive failures that we stop trusting push and
 *                 refetch on a timer instead. This is the required fallback:
 *                 the page must never simply freeze on a dropped subscription.
 */
export type ConnectionPhase = "connecting" | "live" | "reconnecting" | "polling";

export interface ConnectionState {
  phase: ConnectionPhase;
  consecutiveFailures: number;
}

export type ConnectionEvent =
  | { type: "subscribed" }
  | { type: "channel_error" }
  | { type: "timed_out" }
  | { type: "closed" };

/** Failures in a row before we stop trusting push updates and start polling. */
export const MAX_FAILURES_BEFORE_POLLING = 2;

export const initialConnectionState: ConnectionState = {
  phase: "connecting",
  consecutiveFailures: 0,
};

export function connectionReducer(
  state: ConnectionState,
  event: ConnectionEvent,
): ConnectionState {
  if (event.type === "subscribed") {
    return { phase: "live", consecutiveFailures: 0 };
  }

  const consecutiveFailures = state.consecutiveFailures + 1;
  const phase: ConnectionPhase =
    consecutiveFailures >= MAX_FAILURES_BEFORE_POLLING ? "polling" : "reconnecting";
  return { phase, consecutiveFailures };
}

/** Whether the UI should show a reassuring "live" indicator right now. */
export function isConnectionLive(state: ConnectionState): boolean {
  return state.phase === "live";
}

/** Whether the page should be running its polling-fallback timer right now. */
export function shouldPoll(state: ConnectionState): boolean {
  return state.phase === "polling";
}
