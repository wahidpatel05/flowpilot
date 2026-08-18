import { describe, expect, it } from "vitest";
import { generateTokenNumber } from "../src/token/tokenNumber";

describe("generateTokenNumber", () => {
  it("prefixes with the Service name's first letter, uppercased", () => {
    expect(generateTokenNumber("Examination Cell")).toMatch(/^E-\d{3}$/);
    expect(generateTokenNumber("fees")).toMatch(/^F-\d{3}$/);
  });

  it("falls back to V when the name has no leading letter", () => {
    expect(generateTokenNumber("")).toMatch(/^V-\d{3}$/);
    expect(generateTokenNumber("42")).toMatch(/^V-\d{3}$/);
  });

  it("pads the suffix to three digits", () => {
    // Run enough times that a single-digit draw would show up if unpadded.
    for (let i = 0; i < 50; i += 1) {
      const [, suffix] = generateTokenNumber("Documents").split("-");
      expect(suffix).toHaveLength(3);
    }
  });
});
