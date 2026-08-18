import { describe, expect, it, vi } from "vitest";
import { generateTokenNumber } from "./tokenNumber";

describe("generateTokenNumber", () => {
  it("uses the service slug's first letter, uppercased", () => {
    expect(generateTokenNumber("examination")).toMatch(/^E-\d{3}$/);
    expect(generateTokenNumber("fees")).toMatch(/^F-\d{3}$/);
  });

  it("falls back to V when no slug is known", () => {
    expect(generateTokenNumber(undefined)).toMatch(/^V-\d{3}$/);
    expect(generateTokenNumber("")).toMatch(/^V-\d{3}$/);
    expect(generateTokenNumber("   ")).toMatch(/^V-\d{3}$/);
  });

  it("produces a 3-digit suffix within 100-999", () => {
    const random = vi.spyOn(Math, "random");
    random.mockReturnValue(0);
    expect(generateTokenNumber("documents")).toBe("D-100");
    random.mockReturnValue(0.999999);
    expect(generateTokenNumber("documents")).toBe("D-999");
    random.mockRestore();
  });
});
