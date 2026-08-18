"use client";

import type { ControlTotals, HealthBreakdown } from "../lib/controlViewModel";
import { Icon, type IconName } from "./Icon";

function formatAverage(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 1) return "<1";
  return String(Math.round(minutes));
}

interface Stat {
  icon: IconName;
  value: string;
  unit?: string;
  label: string;
  note?: string;
  tone?: "critical";
  /** The one figure the Manager is here to watch, lifted out of the row. */
  featured?: boolean;
}

/**
 * The facility at a glance, as one board of four figures rather than a wall of
 * tiles — every value read straight from the view model.
 */
export function FacilityTotals({
  totals,
  healthBreakdown,
  totalCounters,
  activeCounters,
}: {
  totals: ControlTotals;
  healthBreakdown: HealthBreakdown;
  totalCounters: number;
  activeCounters: number;
}) {
  const stats: Stat[] = [
    {
      icon: "people",
      value: String(totals.visitorsWaiting),
      label: "Waiting",
      ...(totals.simulatedWaiting > 0
        ? { note: `${totals.simulatedWaiting} simulated` }
        : {}),
    },
    {
      icon: "clock",
      value: formatAverage(totals.averageWaitMinutes),
      unit: "min",
      label: "Average wait",
      note: "weighted by queue",
      featured: true,
    },
    {
      icon: "counter",
      value: `${activeCounters}/${totalCounters}`,
      label: "Counters open",
    },
    {
      icon: "bell",
      value: String(healthBreakdown.critical),
      label: "Critical",
      ...(totals.servicesStalled > 0
        ? { note: `${totals.servicesStalled} stalled`, tone: "critical" as const }
        : {}),
      ...(healthBreakdown.critical > 0 ? { tone: "critical" as const } : {}),
    },
  ];

  return (
    <section className="fp-statboard" aria-label="Facility totals">
      <div className="fp-statboard-head">
        <h2 className="fp-statboard-title">Facility now</h2>
        <span className="fp-statboard-badge">Live</span>
      </div>

      <div className="fp-statboard-row">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="fp-stat"
            data-featured={stat.featured ? "true" : undefined}
            data-tone={stat.tone}
          >
            <span className="fp-stat-icon" aria-hidden="true">
              <Icon name={stat.icon} size={20} />
            </span>
            <p className="fp-stat-value" data-animate="count">
              {stat.value}
              {stat.unit !== undefined ? (
                <span className="fp-stat-unit">{stat.unit}</span>
              ) : null}
            </p>
            <span className="fp-stat-label">{stat.label}</span>
            {stat.note !== undefined ? (
              <span className="fp-stat-note">{stat.note}</span>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
