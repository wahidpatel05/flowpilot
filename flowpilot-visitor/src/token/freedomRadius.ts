/**
 * Freedom Radius (CONTEXT.md): the guidance telling a Visitor whether they may
 * leave, should stay nearby, or are next. This is the decision that makes the
 * app change a Visitor's behaviour rather than just render a number — see A4.
 *
 * Derived from the live ETA and position, never a fixed timer, so it moves
 * exactly when the underlying queue does. Scoped to `waiting` only: once
 * called or beyond, tokenPresentation's own status message already tells the
 * Visitor what to do, and layering Freedom Radius on top would blur two
 * different signals together (the same reasoning improvementMoment.ts uses
 * for scoping the celebration to `waiting`).
 *
 * Thresholds are this app's own judgement call — nothing in the spec pins
 * exact minutes — kept as named constants so the call is visible and easy to
 * revisit.
 */
import type { TokenStatus } from "@flowpilot/core";

export type FreedomRadiusState = "free-to-leave" | "stay-nearby" | "turn-approaching";

/** At or below this many people ahead, the Visitor is treated as next regardless of ETA. */
export const TURN_APPROACHING_CUSTOMERS_AHEAD = 1;
/** At or below this predicted wait, the turn is close enough to need the strongest signal. */
export const TURN_APPROACHING_ETA_MINUTES = 5;
/** Above this predicted wait, the Visitor is free to leave rather than merely nearby. */
export const STAY_NEARBY_ETA_MINUTES = 15;

interface FreedomRadiusInput {
  status: TokenStatus;
  /** Null means an unbounded wait (Closed service) — see CONTEXT.md's "Closed". */
  etaMinutes: number | null;
  customersAhead: number | null;
}

/** Null when the Token isn't queueing — Freedom Radius has nothing to say. */
export function deriveFreedomRadius({
  status,
  etaMinutes,
  customersAhead,
}: FreedomRadiusInput): FreedomRadiusState | null {
  if (status !== "waiting") return null;

  if (customersAhead !== null && customersAhead <= TURN_APPROACHING_CUSTOMERS_AHEAD) {
    return "turn-approaching";
  }
  // No open Counter: an unbounded wait is the opposite of imminent.
  if (etaMinutes === null) return "free-to-leave";
  if (etaMinutes <= TURN_APPROACHING_ETA_MINUTES) return "turn-approaching";
  if (etaMinutes <= STAY_NEARBY_ETA_MINUTES) return "stay-nearby";
  return "free-to-leave";
}

export const FREEDOM_RADIUS_LABEL: Record<FreedomRadiusState, string> = {
  "free-to-leave": "You're free to go",
  "stay-nearby": "Stay nearby",
  "turn-approaching": "Your turn is approaching",
};
