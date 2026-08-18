/**
 * Health's wording, shared by every screen that shows a QueueSnapshot's Health:
 * the catalogue card and the Live Token screen. One place, so "Closed" and the
 * Health words can't drift into two spellings across the app.
 */
import type { QueueHealth } from "@flowpilot/core";

export const HEALTH_LABEL: Record<QueueHealth, string> = {
  healthy: "Healthy",
  busy: "Busy",
  critical: "Critical",
};

/**
 * Shown instead of a Health word when the Service has no capacity at all. Not a
 * fourth Health band — the canonical value stays "critical" — but "Closed" is
 * what a Visitor can act on where an infinite wait is not. See CONTEXT.md.
 */
export const CLOSED_HEALTH_LABEL = "Closed";

/** The Health word for a Service, or "Closed" when it has no active Counter. */
export function healthLabelFor(health: QueueHealth, isOpen: boolean): string {
  return isOpen ? HEALTH_LABEL[health] : CLOSED_HEALTH_LABEL;
}

/** A closed Service is a fact the Visitor can act on. "Infinity min" is not. */
export function waitLabelFor(waitMinutes: number | null): string {
  if (waitMinutes === null) return "No counter open";
  if (waitMinutes < 1) return "No wait";
  return `${waitMinutes} min`;
}
