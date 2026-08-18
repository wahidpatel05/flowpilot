"use client";

import { ESTIMATED_TIME_RETURNED_LABEL, formatMinutesReturned } from "../lib/core";
import { describeMove } from "../lib/describeAction";
import { formatTimelineClock } from "../lib/interventionTimeline";
import type { InterventionRow } from "../lib/interventionTarget";
import type { NameLookup } from "../lib/names";

/**
 * Where the Manager stands in the lifecycle. `apply_intervention()` accepts an
 * `approved` or `accepted` Intervention, so Apply is offered in all three
 * states — the Desk's acceptance is the Staff member's consent, not a gate on
 * Control's authority.
 */
const STATUS_NOTE: Readonly<Record<string, string>> = {
  approved: "Approved. The Desk has not accepted yet — applying now changes capacity immediately.",
  pending_staff: "Waiting on the staff member to confirm at the Desk.",
  accepted: "The staff member accepted. Apply to change capacity.",
};

/**
 * The Apply card: the one control on this page that changes the real world.
 *
 * The button calls `apply_intervention()` through `useInterventions` and
 * nothing else — Control never writes an Assignment row itself (INTEGRATION.md:
 * "Do not write `counter_assignments` by hand from a client").
 */
export function InterventionApplyCard({
  intervention,
  staffNames,
  counterNames,
  serviceNames,
  applying,
  applyError,
  justApplied,
  onApply,
}: {
  intervention: InterventionRow | null;
  staffNames: NameLookup;
  counterNames: NameLookup;
  serviceNames: NameLookup;
  applying: boolean;
  applyError: string | null;
  justApplied: boolean;
  onApply: (id: string) => void;
}) {
  if (intervention === null) {
    return (
      <section className="fp-panel fp-apply-card" aria-live="polite">
        <h2 className="fp-panel-title">Intervention</h2>
        <p className="fp-callout-clear">
          {justApplied
            ? "Applied. Capacity has changed and the forecast is settling."
            : "Nothing approved is waiting to be applied."}
        </p>
        {applyError !== null ? (
          <p className="fp-rec-error" role="alert">
            {applyError}
          </p>
        ) : null}
      </section>
    );
  }

  const approvedAtMillis =
    intervention.approved_at == null ? Number.NaN : Date.parse(intervention.approved_at);
  const estimated = intervention.estimated_minutes_returned ?? 0;

  return (
    <section
      className="fp-panel fp-apply-card"
      data-state="awaiting"
      aria-live="polite"
      key={intervention.id}
    >
      <div className="fp-rec-head">
        <h2 className="fp-panel-title">Intervention</h2>
        <span className="fp-apply-status" data-status={intervention.status}>
          {intervention.status.replace(/_/g, " ")}
        </span>
      </div>

      <p className="fp-rec-move">
        {describeMove(intervention, { staffNames, counterNames, serviceNames })}
      </p>
      <p className="fp-rec-duration">{STATUS_NOTE[intervention.status] ?? ""}</p>

      <dl className="fp-rec-metrics">
        <div className="fp-rec-metric">
          <dt>Approved at</dt>
          <dd>{formatTimelineClock(approvedAtMillis)}</dd>
        </div>
        <div className="fp-rec-metric" data-emphasis="true">
          <dt>{ESTIMATED_TIME_RETURNED_LABEL}</dt>
          <dd>{formatMinutesReturned(estimated)}</dd>
        </div>
      </dl>

      <div className="fp-rec-actions">
        <button
          type="button"
          className="fp-button fp-apply-button"
          data-variant="primary"
          disabled={applying}
          onClick={() => onApply(intervention.id)}
        >
          {applying ? <span className="fp-spinner" aria-hidden="true" /> : null}
          {applying ? "Applying…" : "Apply intervention"}
        </button>
      </div>

      <p className="fp-apply-warning">
        This is the only action on this page that changes the facility.
      </p>

      {applyError !== null ? (
        <p className="fp-rec-error" role="alert">
          {applyError}
        </p>
      ) : null}
    </section>
  );
}
