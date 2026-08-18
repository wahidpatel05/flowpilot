import type { AvatarMood } from "../components/FlowPilotAvatar";

export interface AvatarMoodInput {
  actionError: string | null;
  generating: boolean;
  hasActiveRecommendation: boolean;
  justApproved: boolean;
  criticalNow: boolean;
}

/**
 * One mood, in priority order: a swallowed-nowhere error always wins (the
 * Manager needs to notice it), then the "just said yes" beat, then whatever
 * the engine is actually doing. Pure so the mapping is testable without
 * mounting the avatar or the page.
 */
export function deriveAvatarMood(input: AvatarMoodInput): AvatarMood {
  if (input.actionError !== null) return "confused";
  if (input.justApproved) return "excited";
  if (input.generating) return "thinking";
  if (input.hasActiveRecommendation) return "idea";
  if (input.criticalNow) return "alert";
  return "idle";
}
