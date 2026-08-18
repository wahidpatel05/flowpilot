/**
 * Freedom Radius's one decision: given status, ETA and position, which of the
 * three guidance states applies? Pure and fixture-based, no mocks — same
 * discipline as improvementMoment.test.ts.
 */
import { describe, expect, it } from "vitest";
import { deriveFreedomRadius } from "../src/token/freedomRadius";

describe("deriveFreedomRadius", () => {
  it("says nothing once the Token has left the waiting state", () => {
    expect(
      deriveFreedomRadius({ status: "called", etaMinutes: 2, customersAhead: 0 }),
    ).toBeNull();
    expect(
      deriveFreedomRadius({ status: "serving", etaMinutes: null, customersAhead: null }),
    ).toBeNull();
  });

  it("is free to leave on a long wait", () => {
    expect(
      deriveFreedomRadius({ status: "waiting", etaMinutes: 30, customersAhead: 10 }),
    ).toBe("free-to-leave");
  });

  it("is free to leave when the Service is Closed (unbounded wait)", () => {
    expect(
      deriveFreedomRadius({ status: "waiting", etaMinutes: null, customersAhead: 5 }),
    ).toBe("free-to-leave");
  });

  it("says stay nearby on a moderate wait", () => {
    expect(
      deriveFreedomRadius({ status: "waiting", etaMinutes: 12, customersAhead: 4 }),
    ).toBe("stay-nearby");
  });

  it("says turn approaching once the ETA is close", () => {
    expect(
      deriveFreedomRadius({ status: "waiting", etaMinutes: 5, customersAhead: 3 }),
    ).toBe("turn-approaching");
  });

  it("says turn approaching for the person next up even on a longer ETA", () => {
    expect(
      deriveFreedomRadius({ status: "waiting", etaMinutes: 20, customersAhead: 0 }),
    ).toBe("turn-approaching");
  });

  it("changes state as the ETA improves, with no timer involved", () => {
    expect(
      deriveFreedomRadius({ status: "waiting", etaMinutes: 16, customersAhead: 6 }),
    ).toBe("free-to-leave");
    expect(
      deriveFreedomRadius({ status: "waiting", etaMinutes: 15, customersAhead: 6 }),
    ).toBe("stay-nearby");
  });
});
