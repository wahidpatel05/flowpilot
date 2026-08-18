/**
 * DeQueue Visitor design tokens — from the Visitor design system.
 *
 * Warm cream ground, white cards, yellow primary, friendly and light. This is
 * deliberately NOT Control's dark command-centre palette: Control is read
 * across a room under pressure, this is read in someone's hand while they
 * decide whether they can go and sit down.
 *
 * Neo-brutalist surface language: every card, button and pill carries a solid
 * black outline plus a hard (unblurred) offset shadow — see NeoBox — rather
 * than a soft drop shadow. `border` is therefore black, not a light hairline.
 */
import type { QueueHealth } from "@flowpilot/core";

export const colors = {
  background: "#FFF7E6",
  card: "#FFFFFF",
  border: "#111111",
  text: "#111111",
  /** Secondary copy — the meta line and helper text. */
  muted: "#6B6B6B",
  primary: "#FFD233",
  pink: "#FF4DA6",
  purple: "#7B61FF",
  green: "#22C55E",
  /**
   * Critical red. The status indicator in the design is red rather than the
   * palette's pink, so it is named here as its own token instead of bending
   * Pink to a job it does not do.
   */
  red: "#EF4444",
  /** The Closed indicator's grey. */
  grey: "#9CA3AF",
} as const;

/**
 * Health's colour. Never the only channel carrying it — every surface showing
 * this also shows the status word beside it.
 */
export const healthColor: Record<QueueHealth, string> = {
  healthy: colors.green,
  busy: colors.primary,
  critical: colors.red,
};

/** 8pt rhythm. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/** Rounded corners throughout, per the design's icon and card style. */
export const radius = {
  md: 12,
  lg: 16,
} as const;

/**
 * Android's minimum comfortable touch target. Anything a thumb hits is measured
 * against this rather than eyeballed.
 */
export const MIN_TOUCH_TARGET = 48;

/** NeoBox's hard-shadow geometry: outline weight and the offset it sits behind. */
export const neo = {
  borderWidth: 2,
  shadowOffset: 4,
  /** The smaller offset used by buttons and badges, so tap targets don't feel oversized. */
  shadowOffsetSmall: 3,
} as const;
