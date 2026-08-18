import { describe, expect, it } from "vitest";
import { formatWaitMinutes } from "./formatMinutes";

describe("formatWaitMinutes", () => {
  it("renders an em dash for non-finite waits", () => {
    expect(formatWaitMinutes(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatWaitMinutes(Number.NaN)).toBe("—");
  });

  it("renders <1 for sub-minute waits", () => {
    expect(formatWaitMinutes(0.4)).toBe("<1");
    expect(formatWaitMinutes(0)).toBe("<1");
  });

  it("rounds to the nearest minute otherwise", () => {
    expect(formatWaitMinutes(12.6)).toBe("13");
    expect(formatWaitMinutes(12.4)).toBe("12");
  });
});
