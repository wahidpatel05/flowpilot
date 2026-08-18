import { describe, expect, it } from "vitest";
import { deriveConnectionState } from "../src/token/connectionState";

describe("deriveConnectionState", () => {
  it("is connecting before any channel has reported a status", () => {
    expect(deriveConnectionState([])).toBe("connecting");
    expect(deriveConnectionState([undefined, undefined])).toBe("connecting");
  });

  it("is connecting while only some channels have reported, even if those are SUBSCRIBED", () => {
    // The bug this guards against: an array shorter than the channel count
    // reads every REPORTED status as SUBSCRIBED and calls that "live," before
    // every channel has actually confirmed.
    expect(deriveConnectionState(["SUBSCRIBED", undefined])).toBe("connecting");
  });

  it("is live once every channel is subscribed", () => {
    expect(deriveConnectionState(["SUBSCRIBED", "SUBSCRIBED"])).toBe("live");
  });

  it("is reconnecting while any channel is still catching up", () => {
    expect(deriveConnectionState(["SUBSCRIBED", "TIMED_OUT"])).toBe("reconnecting");
  });

  it("is reconnecting on a channel error", () => {
    expect(deriveConnectionState(["CHANNEL_ERROR"])).toBe("reconnecting");
  });

  it("is reconnecting on a closed channel", () => {
    expect(deriveConnectionState(["SUBSCRIBED", "CLOSED"])).toBe("reconnecting");
  });
});
