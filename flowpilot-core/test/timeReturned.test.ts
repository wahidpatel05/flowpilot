import { describe, expect, it } from "vitest";
import {
  ESTIMATED_TIME_RETURNED_LABEL,
  estimateMinutesReturned,
  formatMinutesReturned,
  sumMinutesReturned,
} from "../src/metrics/timeReturned.js";
import type { SimulationResult } from "../src/types.js";

function result(total: number): SimulationResult {
  return {
    services: [],
    totalPersonMinutesWaiting: total,
    horizonMinutes: 60,
  };
}

describe("estimateMinutesReturned", () => {
  it("is the person-minute delta between baseline and optimized", () => {
    expect(estimateMinutesReturned(result(500), result(380))).toBe(120);
  });

  it("clamps at zero when the optimized run is worse", () => {
    expect(estimateMinutesReturned(result(300), result(420))).toBe(0);
  });
});

describe("formatMinutesReturned", () => {
  it("uses minutes below one hour", () => {
    expect(formatMinutesReturned(42)).toBe("42 min");
    expect(formatMinutesReturned(59)).toBe("59 min");
  });

  it("switches to hours at exactly 60", () => {
    expect(formatMinutesReturned(60)).toBe("1h 00m");
    expect(formatMinutesReturned(61)).toBe("1h 01m");
  });

  it("zero-pads the minute component", () => {
    expect(formatMinutesReturned(246)).toBe("4h 06m");
    expect(formatMinutesReturned(258)).toBe("4h 18m");
  });

  it("handles zero, negative and non-finite input", () => {
    expect(formatMinutesReturned(0)).toBe("0 min");
    expect(formatMinutesReturned(-5)).toBe("0 min");
    expect(formatMinutesReturned(Number.POSITIVE_INFINITY)).toBe("0 min");
    expect(formatMinutesReturned(Number.NaN)).toBe("0 min");
  });

  it("rounds fractional person-minutes", () => {
    expect(formatMinutesReturned(59.4)).toBe("59 min");
    expect(formatMinutesReturned(59.6)).toBe("1h 00m");
  });
});

describe("sumMinutesReturned", () => {
  it("adds applied interventions for a session total", () => {
    expect(sumMinutesReturned([12, 0, 30.5, -4])).toBeCloseTo(42.5, 10);
  });
});

describe("copy", () => {
  it("labels the metric as estimated, never measured or saved", () => {
    expect(ESTIMATED_TIME_RETURNED_LABEL).toBe("Estimated time returned");
  });
});
