import { describe, expect, it } from "vitest";
import { deriveAvatarMood, type AvatarMoodInput } from "./avatarMood";

function input(overrides: Partial<AvatarMoodInput> = {}): AvatarMoodInput {
  return {
    actionError: null,
    generating: false,
    hasActiveRecommendation: false,
    justApproved: false,
    justApplied: false,
    criticalNow: false,
    ...overrides,
  };
}

describe("deriveAvatarMood", () => {
  it("defaults to idle when nothing is happening", () => {
    expect(deriveAvatarMood(input())).toBe("idle");
  });

  it("is alert when a Service is critical and nothing else is going on", () => {
    expect(deriveAvatarMood(input({ criticalNow: true }))).toBe("alert");
  });

  it("is idea once a Recommendation is ready, even if a Service is critical", () => {
    expect(
      deriveAvatarMood(input({ criticalNow: true, hasActiveRecommendation: true })),
    ).toBe("idea");
  });

  it("is thinking while generating, ahead of idea and alert", () => {
    expect(
      deriveAvatarMood(
        input({ generating: true, hasActiveRecommendation: true, criticalNow: true }),
      ),
    ).toBe("thinking");
  });

  it("is excited right after an approval, ahead of everything but an error", () => {
    expect(
      deriveAvatarMood(input({ justApproved: true, generating: true, criticalNow: true })),
    ).toBe("excited");
  });

  it("is excited right after an apply — the moment capacity actually changed", () => {
    expect(
      deriveAvatarMood(input({ justApplied: true, generating: true, criticalNow: true })),
    ).toBe("excited");
  });

  it("is confused on an action error, outranking every other state", () => {
    expect(
      deriveAvatarMood(
        input({
          actionError: "boom",
          justApproved: true,
          justApplied: true,
          generating: true,
          hasActiveRecommendation: true,
          criticalNow: true,
        }),
      ),
    ).toBe("confused");
  });
});
