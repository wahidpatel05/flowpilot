import { describe, expect, it } from "vitest";
import { isWaitImprovement } from "./etaImprovement";

describe("isWaitImprovement", () => {
  it("is true when the wait drops by at least the minimum threshold", () => {
    expect(isWaitImprovement(17, 12)).toBe(true);
    expect(isWaitImprovement(10, 9)).toBe(true);
  });

  it("is false for a drop smaller than the threshold", () => {
    expect(isWaitImprovement(10, 9.5)).toBe(false);
  });

  it("is false when the wait stays the same or rises", () => {
    expect(isWaitImprovement(10, 10)).toBe(false);
    expect(isWaitImprovement(10, 15)).toBe(false);
  });

  it("is false when either side is null — nothing to compare against", () => {
    expect(isWaitImprovement(null, 5)).toBe(false);
    expect(isWaitImprovement(10, null)).toBe(false);
    expect(isWaitImprovement(null, null)).toBe(false);
  });

  it("is false for a non-finite reading on either side", () => {
    expect(isWaitImprovement(Number.POSITIVE_INFINITY, 5)).toBe(false);
    expect(isWaitImprovement(10, Number.POSITIVE_INFINITY)).toBe(false);
  });
});
