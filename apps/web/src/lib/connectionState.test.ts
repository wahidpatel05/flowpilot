import { describe, expect, it } from "vitest";
import {
  connectionReducer,
  initialConnectionState,
  isConnectionLive,
  shouldPoll,
  type ConnectionState,
} from "./connectionState";

describe("connectionReducer", () => {
  it("starts connecting, not live and not polling", () => {
    expect(initialConnectionState.phase).toBe("connecting");
    expect(isConnectionLive(initialConnectionState)).toBe(false);
    expect(shouldPoll(initialConnectionState)).toBe(false);
  });

  it("goes live on the first successful subscribe", () => {
    const next = connectionReducer(initialConnectionState, { type: "subscribed" });
    expect(next.phase).toBe("live");
    expect(next.consecutiveFailures).toBe(0);
    expect(isConnectionLive(next)).toBe(true);
  });

  it("treats one failure as reconnecting, not polling", () => {
    const next = connectionReducer(initialConnectionState, { type: "channel_error" });
    expect(next.phase).toBe("reconnecting");
    expect(shouldPoll(next)).toBe(false);
  });

  it("falls back to polling after enough consecutive failures", () => {
    let state: ConnectionState = initialConnectionState;
    state = connectionReducer(state, { type: "channel_error" });
    state = connectionReducer(state, { type: "timed_out" });
    expect(state.phase).toBe("polling");
    expect(shouldPoll(state)).toBe(true);
  });

  it("treats closed the same as an error for the failure count", () => {
    let state: ConnectionState = initialConnectionState;
    state = connectionReducer(state, { type: "closed" });
    state = connectionReducer(state, { type: "closed" });
    expect(state.phase).toBe("polling");
  });

  it("a later successful subscribe recovers from polling back to live", () => {
    let state: ConnectionState = initialConnectionState;
    state = connectionReducer(state, { type: "channel_error" });
    state = connectionReducer(state, { type: "channel_error" });
    expect(state.phase).toBe("polling");

    state = connectionReducer(state, { type: "subscribed" });
    expect(state.phase).toBe("live");
    expect(state.consecutiveFailures).toBe(0);
  });

  it("does not accumulate failures across a recovery", () => {
    let state: ConnectionState = initialConnectionState;
    state = connectionReducer(state, { type: "channel_error" });
    state = connectionReducer(state, { type: "subscribed" });
    state = connectionReducer(state, { type: "channel_error" });
    // one failure after a fresh "live", not two — must not be polling yet
    expect(state.phase).toBe("reconnecting");
  });
});
