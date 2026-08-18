"use client";

import { useVisitorQueue } from "../../hooks/useVisitorQueue";
import { ServicePicker } from "../../components/visitor/ServicePicker";
import { TokenPanel } from "../../components/visitor/TokenPanel";
import { findQueueSnapshot } from "../../lib/core";

/**
 * The insurance-scope Visitor PWA route (docs/adr/0004). One route, plain
 * Service list, Join Queue, Token + ETA + people ahead, live ETA update.
 * Freedom Radius, Journey, the Activity feed, notifications and Gemini
 * routing are deliberately out — they all exist on Android already.
 */
export default function VisitorPage() {
  const { projection, session, myEta, connection, error, isJoining, join, leave } =
    useVisitorQueue();

  const snapshots = new Map(
    projection === null
      ? []
      : projection.serviceDetails.map((service) => [
          service.serviceId,
          findQueueSnapshot(projection, service.serviceId),
        ]),
  );

  return (
    <main className="fp-visitor-page">
      <header className="fp-visitor-header">
        <h1 className="fp-visitor-title">DeQueue</h1>
        <p className="fp-visitor-subtitle">
          {session === null
            ? "Pick a service, join the queue, watch your wait drop."
            : "You're in line — this page updates on its own."}
        </p>
      </header>

      {error !== null ? <div className="fp-error">{error}</div> : null}

      {projection === null ? (
        <p className="fp-empty">Loading services…</p>
      ) : session === null ? (
        <ServicePicker
          services={projection.serviceDetails}
          snapshots={snapshots}
          onJoin={join}
          isJoining={isJoining}
        />
      ) : (
        <TokenPanel
          tokenNumber={session.tokenNumber}
          eta={myEta}
          connection={connection}
          onLeave={leave}
        />
      )}
    </main>
  );
}
