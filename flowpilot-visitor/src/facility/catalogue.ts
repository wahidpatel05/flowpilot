/**
 * Service catalogue view models.
 *
 * This module turns a FacilityProjection into what the Visitor reads, and it
 * owns nothing but wording. Every number here is lifted from the projection's
 * QueueSnapshots — computed by flowpilot-core, the same engine Control renders.
 * If an ETA is ever calculated in this file, the phone and the dashboard can
 * disagree about the same queue, which is the one bug this architecture exists
 * to prevent (INTEGRATION.md, rule 1).
 */
import {
  findQueueSnapshot,
  type FacilityProjection,
  type QueueHealth,
} from "@flowpilot/core";

/** One Service as the Visitor sees it on the home screen. */
export interface ServiceCardModel {
  serviceId: string;
  name: string;
  /** Canonical Health from the engine. Never re-derived here. */
  health: QueueHealth;
  /**
   * The Health word on the badge, so Health never rides on colour alone.
   * Tracks Health, except that a Service with no open Counter reads "Closed" —
   * true, actionable, and the indicator the design provides for it.
   */
  healthLabel: string;
  queueLength: number;
  queueLabel: string;
  /** Queue and wait on one line: "16 people · 31 min". */
  metaLabel: string;
  /** Predicted wait, rounded for display. Null when no Counter is open. */
  waitMinutes: number | null;
  waitLabel: string;
  activeCounters: number;
  /** FALSE when no active Assignment gives this Service capacity. */
  isOpen: boolean;
}

const HEALTH_LABEL: Record<QueueHealth, string> = {
  healthy: "Healthy",
  busy: "Busy",
  critical: "Critical",
};

/** Shown instead of a Health word when the Service has no capacity at all. */
export const CLOSED_HEALTH_LABEL = "Closed";

function queueLabelFor(queueLength: number): string {
  if (queueLength <= 0) return "No one waiting";
  if (queueLength === 1) return "1 person";
  return `${queueLength} people`;
}

function waitLabelFor(waitMinutes: number | null): string {
  // A closed Service is a fact the Visitor can act on. "Infinity min" is not.
  if (waitMinutes === null) return "No counter open";
  if (waitMinutes < 1) return "No wait";
  return `${waitMinutes} min`;
}

/**
 * Every Service in the catalogue, in the order the database returned them.
 * A Service with no QueueSnapshot cannot happen — projectFacility emits one per
 * Service row — but it is skipped rather than rendered with invented numbers.
 */
export function buildServiceCatalogue(
  projection: FacilityProjection,
): ServiceCardModel[] {
  const cards: ServiceCardModel[] = [];

  for (const service of projection.serviceDetails) {
    const snapshot = findQueueSnapshot(projection, service.serviceId);
    if (snapshot === undefined) continue;

    const isOpen = snapshot.activeCounters > 0;
    const waitMinutes =
      isOpen && Number.isFinite(snapshot.predictedWaitMinutes)
        ? Math.round(snapshot.predictedWaitMinutes)
        : null;
    const queueLabel = queueLabelFor(snapshot.queueLength);
    const waitLabel = waitLabelFor(waitMinutes);

    cards.push({
      serviceId: service.serviceId,
      name: service.serviceName ?? service.slug ?? "Service",
      health: snapshot.health,
      healthLabel: isOpen ? HEALTH_LABEL[snapshot.health] : CLOSED_HEALTH_LABEL,
      queueLength: snapshot.queueLength,
      queueLabel,
      metaLabel: `${queueLabel} · ${waitLabel}`,
      waitMinutes,
      waitLabel,
      activeCounters: snapshot.activeCounters,
      isOpen,
    });
  }

  return cards;
}
