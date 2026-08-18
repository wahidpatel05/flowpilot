"use client";

import { useState } from "react";
import type { ControlServiceNode } from "../lib/controlViewModel";
import type { QueueHealth } from "../lib/core";
import { formatWaitMinutes } from "../lib/formatMinutes";
import { Chip } from "./Chip";
import { Icon } from "./Icon";
import { StatusPill } from "./StatusPill";

type Filter = "all" | QueueHealth;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "healthy", label: "Healthy" },
  { id: "busy", label: "Busy" },
  { id: "critical", label: "Critical" },
];

/**
 * Every Service as a card — the "Cards" component from the design system,
 * filterable by its current Health band. Which filter is selected is pure UI
 * state (like the Now/Forecast toggle); every number on the card still comes
 * from the view model.
 */
export function ServiceStatusGrid({ services }: { services: readonly ControlServiceNode[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = filter === "all" ? services : services.filter((s) => s.now.health === filter);

  return (
    <section className="fp-panel fp-services-panel" aria-label="Services">
      <div className="fp-services-head">
        <h2 className="fp-panel-title">Services</h2>
        <div className="fp-chip-row" role="group" aria-label="Filter by Health">
          {FILTERS.map((f) => (
            <Chip key={f.id} label={f.label} active={filter === f.id} onClick={() => setFilter(f.id)} />
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="fp-callout-clear">No Service matches this filter.</p>
      ) : (
        <div className="fp-service-grid">
          {visible.map((service) => (
            <article key={service.serviceId} className="fp-service-card" data-health={service.now.health}>
              <span className="fp-service-card-icon" aria-hidden="true">
                <Icon name="people" />
              </span>
              <div className="fp-service-card-body">
                <h3 className="fp-service-card-name">{service.name}</h3>
                <p className="fp-service-card-meta">
                  {service.now.queueLength} people · {formatWaitMinutes(service.now.waitMinutes)} min
                </p>
              </div>
              <StatusPill health={service.now.health} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
