"use client";

import { useMemo, useState } from "react";
import { useLiveFacility } from "../hooks/useLiveFacility";
import { ConnectionBadge } from "../components/ConnectionBadge";
import { ServiceCard } from "../components/ServiceCard";
import { Chip } from "../components/Chip";
import { Icon } from "../components/Icon";
import { findQueueSnapshot, type QueueHealth } from "../lib/core";

type Filter = "all" | QueueHealth;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "healthy", label: "Healthy" },
  { id: "busy", label: "Busy" },
  { id: "critical", label: "Critical" },
];

export default function LiveQueuePage() {
  const { projection, connection, error } = useLiveFacility();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  /*
   * Search and Health filter are pure UI state — they narrow which Services
   * are shown and never touch the numbers on a card, which still come from
   * the projection and the engine's QueueSnapshot.
   */
  const visible = useMemo(() => {
    if (projection === null) return [];
    const needle = query.trim().toLowerCase();

    return projection.serviceDetails.filter((service) => {
      const snapshot = findQueueSnapshot(projection, service.serviceId);
      const health = snapshot?.health ?? "healthy";
      if (filter !== "all" && health !== filter) return false;
      if (needle.length === 0) return true;

      const name = (service.serviceName ?? service.serviceId).toLowerCase();
      return name.includes(needle) || (service.slug ?? "").toLowerCase().includes(needle);
    });
  }, [projection, query, filter]);

  return (
    <div className="fp-canvas">
      <main className="fp-page fp-sheet">
        <div className="fp-header">
          <div>
            <h1 className="fp-title">
              Live queues.
              <br />
              Right now.
            </h1>
            <p className="fp-subtitle">
              Every Service in the facility, updating on its own.
            </p>
          </div>
          <ConnectionBadge connection={connection} />
        </div>

        <div className="fp-toolbar">
          <div className="fp-search">
            <span className="fp-search-icon" aria-hidden="true">
              <Icon name="search" size={18} />
            </span>
            <input
              className="fp-search-input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a service…"
              aria-label="Search services"
            />
          </div>

          <div className="fp-chip-row" role="group" aria-label="Filter by Health">
            {FILTERS.map((f) => (
              <Chip
                key={f.id}
                label={f.label}
                active={filter === f.id}
                onClick={() => setFilter(f.id)}
              />
            ))}
          </div>
        </div>

        {error ? <div className="fp-error">{error}</div> : null}

        {projection === null ? (
          <p className="fp-empty">Loading the facility…</p>
        ) : projection.serviceDetails.length === 0 ? (
          <p className="fp-empty">No Services are configured yet.</p>
        ) : visible.length === 0 ? (
          <p className="fp-empty">No Service matches that search.</p>
        ) : (
          <div className="fp-grid">
            {visible.map((service, index) => (
              <ServiceCard
                key={service.serviceId}
                service={service}
                snapshot={findQueueSnapshot(projection, service.serviceId)}
                index={index}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
