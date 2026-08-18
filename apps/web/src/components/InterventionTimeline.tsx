"use client";

import {
  formatTimelineClock,
  type TimelineEntry,
} from "../lib/interventionTimeline";

/**
 * The timeline — the trust feature. It is what lets a Manager explain
 * FlowPilot's reasoning to somebody else, so every row is an event the database
 * actually recorded, at the instant Postgres stamped it, in the prose Postgres
 * wrote. This component orders nothing and phrases nothing: `buildTimeline`
 * already ordered by timestamp AND lifecycle sequence, which is what keeps
 * `approved` ahead of `applied` when both were written inside one RPC call.
 */
export function InterventionTimeline({
  entries,
  error,
}: {
  entries: readonly TimelineEntry[];
  error: string | null;
}) {
  return (
    <section className="fp-panel fp-timeline-panel" aria-label="Intervention timeline">
      <div className="fp-services-head">
        <h2 className="fp-panel-title">Timeline</h2>
        <span className="fp-timeline-count">
          {entries.length === 0 ? "No events yet" : `${entries.length} events`}
        </span>
      </div>

      {error !== null ? (
        <p className="fp-rec-error" role="alert">
          {error}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <p className="fp-callout-clear">
          Nothing has happened yet. Every forecast, approval and capacity change
          lands here with the time it happened.
        </p>
      ) : (
        <ol className="fp-timeline">
          {entries.map((entry) => (
            <li key={entry.id} className="fp-timeline-item" data-tone={entry.tone}>
              <span className="fp-timeline-marker" aria-hidden="true" />
              <div className="fp-timeline-body">
                <div className="fp-timeline-head">
                  <span className="fp-timeline-label">{entry.label}</span>
                  <time className="fp-timeline-time" dateTime={entry.at}>
                    {formatTimelineClock(entry.atMillis)}
                  </time>
                </div>
                <p className="fp-timeline-message">{entry.message}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
