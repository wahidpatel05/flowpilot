import { describe, expect, it } from "vitest";
import { formatElapsedMinutes } from "./elapsed";

describe("formatElapsedMinutes", () => {
  it("formats zero elapsed time", () => {
    expect(formatElapsedMinutes(1_000, 1_000)).toBe("0:00");
  });

  it("formats under a minute with zero-padded seconds", () => {
    expect(formatElapsedMinutes(0, 5_000)).toBe("0:05");
  });

  it("formats minutes and seconds", () => {
    expect(formatElapsedMinutes(0, 65_000)).toBe("1:05");
  });

  it("clamps a negative elapsed time (clock skew) to zero", () => {
    expect(formatElapsedMinutes(10_000, 1_000)).toBe("0:00");
  });

  it("does not roll minutes over into hours", () => {
    expect(formatElapsedMinutes(0, 61 * 60_000 + 5_000)).toBe("61:05");
  });
});
