"use client";

import { useLiveFacility } from "../hooks/useLiveFacility";
import { ConnectionBadge } from "../components/ConnectionBadge";
import { ServiceCard } from "../components/ServiceCard";
import { findQueueSnapshot } from "../lib/core";

export default function LiveQueuePage() {
  const { projection, connection, error } = useLiveFacility();

  return (
    <main className="fp-page">
      <div className="fp-header">
        <div>
          <h1 className="fp-title">FlowPilot</h1>
          <p className="fp-subtitle">Live facility overview</p>
        </div>
        <ConnectionBadge connection={connection} />
      </div>

      {error ? <div className="fp-error">{error}</div> : null}

      {!projection ? (
        <p className="fp-empty">Loading the facility…</p>
      ) : projection.serviceDetails.length === 0 ? (
        <p className="fp-empty">No Services are configured yet.</p>
      ) : (
        <div className="fp-grid">
          {projection.serviceDetails.map((service) => (
            <ServiceCard
              key={service.serviceId}
              service={service}
              snapshot={findQueueSnapshot(projection, service.serviceId)}
            />
          ))}
        </div>
      )}
    </main>
  );
}
