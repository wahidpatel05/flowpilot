"use client";

import type { ControlTotals } from "../lib/controlViewModel";

function formatAverage(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 1) return "<1";
  return String(Math.round(minutes));
}

/**
 * Facility-level context. Deliberately three figures, not a wall of tiles —
 * the Digital Twin is meant to dominate this page.
 */
export function FacilityTotals({ totals }: { totals: ControlTotals }) {
  return (
    <section className="fp-totals" aria-label="Facility totals">
      <div className="fp-total">
        <span className="fp-total-label">Visitors waiting</span>
        <span className="fp-total-value" data-animate="count">
          {totals.visitorsWaiting}
        </span>
        {totals.simulatedWaiting > 0 ? (
          <span className="fp-total-note">
            {totals.simulatedWaiting} simulated
          </span>
        ) : null}
      </div>

      <div className="fp-total">
        <span className="fp-total-label">Average wait</span>
        <span className="fp-total-value" data-animate="count">
          {formatAverage(totals.averageWaitMinutes)}
          <span className="fp-total-unit">min</span>
        </span>
        <span className="fp-total-note">weighted by queue length</span>
      </div>

      {totals.servicesStalled > 0 ? (
        <div className="fp-total" data-tone="critical">
          <span className="fp-total-label">Stalled Services</span>
          <span className="fp-total-value" data-animate="count">
            {totals.servicesStalled}
          </span>
          <span className="fp-total-note">queue with no open Counter</span>
        </div>
      ) : null}
    </section>
  );
}
