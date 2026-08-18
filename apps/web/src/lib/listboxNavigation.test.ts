import { describe, expect, it } from "vitest";
import { isNavigationKey, nextActiveIndex } from "./listboxNavigation";

describe("isNavigationKey", () => {
  it("accepts the four keys that move the highlight", () => {
    for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
      expect(isNavigationKey(key)).toBe(true);
    }
  });

  it("rejects keys the listbox handles differently", () => {
    for (const key of ["Enter", " ", "Escape", "Tab", "a"]) {
      expect(isNavigationKey(key)).toBe(false);
    }
  });
});

describe("nextActiveIndex", () => {
  it("moves down and up one at a time", () => {
    expect(nextActiveIndex(0, "ArrowDown", 5)).toBe(1);
    expect(nextActiveIndex(3, "ArrowUp", 5)).toBe(2);
  });

  it("wraps at both ends so a long list stays reachable either way", () => {
    expect(nextActiveIndex(4, "ArrowDown", 5)).toBe(0);
    expect(nextActiveIndex(0, "ArrowUp", 5)).toBe(4);
  });

  it("starts at the top on ArrowDown when nothing is highlighted yet", () => {
    expect(nextActiveIndex(-1, "ArrowDown", 5)).toBe(0);
  });

  it("starts at the bottom on ArrowUp when nothing is highlighted yet", () => {
    expect(nextActiveIndex(-1, "ArrowUp", 5)).toBe(4);
  });

  it("jumps to the ends on Home and End", () => {
    expect(nextActiveIndex(2, "Home", 5)).toBe(0);
    expect(nextActiveIndex(2, "End", 5)).toBe(4);
  });

  it("has nothing to highlight in an empty list", () => {
    for (const key of ["ArrowDown", "ArrowUp", "Home", "End"] as const) {
      expect(nextActiveIndex(-1, key, 0)).toBe(-1);
    }
  });

  it("stays put in a single-option list", () => {
    expect(nextActiveIndex(0, "ArrowDown", 1)).toBe(0);
    expect(nextActiveIndex(0, "ArrowUp", 1)).toBe(0);
  });
});
