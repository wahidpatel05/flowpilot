import type { AvatarMood } from "../components/DeQueueAvatar";

export interface AvatarMoodInput {
  actionError: string | null;
  generating: boolean;
  hasActiveRecommendation: boolean;
  justApproved: boolean;
  /** TRUE just after an Intervention actually changed capacity. */
  justApplied: boolean;
  criticalNow: boolean;
}

/**
 * One mood, in priority order: a swallowed-nowhere error always wins (the
 * Manager needs to notice it), then the "just said yes" and "it actually
 * happened" beats, then whatever the engine is actually doing. Pure so the
 * mapping is testable without mounting the avatar or the page.
 */
export function deriveAvatarMood(input: AvatarMoodInput): AvatarMood {
  if (input.actionError !== null) return "confused";
  if (input.justApplied || input.justApproved) return "excited";
  if (input.generating) return "thinking";
  if (input.hasActiveRecommendation) return "idea";
  if (input.criticalNow) return "alert";
  return "idle";
}
