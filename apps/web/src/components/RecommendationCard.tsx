"use client";

import { useState } from "react";
import { ESTIMATED_TIME_RETURNED_LABEL, formatMinutesReturned } from "../lib/core";
import { formatWaitMinutes } from "../lib/formatMinutes";
import { recommendationParties, type RecommendationRow } from "../lib/recommendationRow";
import type { RecommendationAction } from "../hooks/useRecommendation";
import type { NameLookup } from "../hooks/useLiveFacility";

function name(lookup: NameLookup, id: string | undefined): string {
  if (id === undefined) return "an unnamed party";
  return lookup[id] ?? id;
}

/**
 * A sentence naming the actual Staff member, Counter and Services — never a
 * raw identifier — mirroring the wording `fp_action_label` writes into the
 * timeline, so the card and the audit trail never disagree on how to describe
 * the same move.
 */
function describeMove(
  row: RecommendationRow,
  staffNames: NameLookup,
  counterNames: NameLookup,
  serviceNames: NameLookup,
): string {
  const parties = recommendationParties(row);
  const staffName = name(staffNames, parties.staffId);
  const counterName = name(counterNames, parties.counterId);
  const toServiceName = name(serviceNames, parties.toServiceId);

  if (row.action_type === "activate_counter") {
    return `Open ${counterName} with ${staffName} for ${toServiceName}.`;
  }
  const fromServiceName = name(serviceNames, parties.fromServiceId);
  return `Move ${staffName} from ${fromServiceName} to ${toServiceName}, at ${counterName}.`;
}

export function RecommendationCard({
  recommendation,
  noRecommendation,
  staffNames,
  counterNames,
  serviceNames,
  pendingAction,
  actionError,
  onApprove,
  onReject,
}: {
  recommendation: RecommendationRow | null;
  noRecommendation: boolean;
  staffNames: NameLookup;
  counterNames: NameLookup;
  serviceNames: NameLookup;
  pendingAction: RecommendationAction | null;
  actionError: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
}) {
  const [reasonDraft, setReasonDraft] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const busy = pendingAction !== null;

  if (recommendation === null) {
    return (
      <section className="fp-panel" aria-live="polite">
        <h2 className="fp-panel-title">Recommendation</h2>
        <p className="fp-callout-clear">
          {noRecommendation
            ? "No recommendation right now — nothing projected would return time."
            : "Checking the facility for a recommendation…"}
        </p>
        {actionError !== null ? (
          <p className="fp-rec-error" role="alert">
            {actionError}
          </p>
        ) : null}
      </section>
    );
  }

  const recommendationId = recommendation.id;
  const durationMinutes = recommendationParties(recommendation).durationMinutes;
  const confidence = recommendation.confidence ?? "low";
  const estimatedMinutesReturned = recommendation.estimated_minutes_returned ?? 0;

  function confirmReject() {
    const reason = reasonDraft.trim();
    if (reason.length === 0) return;
    onReject(recommendationId, reason);
    setRejecting(false);
    setReasonDraft("");
  }

  return (
    <section className="fp-panel fp-rec-card" aria-live="polite">
      <div className="fp-rec-head">
        <h2 className="fp-panel-title">Recommendation</h2>
        <span className="fp-rec-confidence" data-confidence={confidence}>
          {confidence} confidence
        </span>
      </div>

      <p className="fp-rec-move">
        {describeMove(recommendation, staffNames, counterNames, serviceNames)}
      </p>
      <p className="fp-rec-duration">For the next {durationMinutes} minutes.</p>

      <dl className="fp-rec-metrics">
        <div className="fp-rec-metric">
          <dt>Wait before</dt>
          <dd>{formatWaitMinutes(recommendation.baseline_wait ?? Number.POSITIVE_INFINITY)} min</dd>
        </div>
        <div className="fp-rec-metric">
          <dt>Wait after</dt>
          <dd>{formatWaitMinutes(recommendation.predicted_wait ?? Number.POSITIVE_INFINITY)} min</dd>
        </div>
        <div className="fp-rec-metric" data-emphasis="true">
          <dt>{ESTIMATED_TIME_RETURNED_LABEL}</dt>
          <dd>{formatMinutesReturned(estimatedMinutesReturned)}</dd>
        </div>
      </dl>

      {!rejecting ? (
        <div className="fp-rec-actions">
          <button
            type="button"
            className="fp-button fp-rec-approve"
            disabled={busy}
            onClick={() => onApprove(recommendation.id)}
          >
            {pendingAction === "approve" ? "Approving…" : "Approve"}
          </button>
          <button
            type="button"
            className="fp-button"
            disabled={busy}
            onClick={() => setRejecting(true)}
          >
            Reject
          </button>
        </div>
      ) : (
        <div className="fp-rec-reject-form">
          <label className="fp-rec-reject-label" htmlFor="fp-rec-reject-reason">
            Reason for rejecting
          </label>
          <textarea
            id="fp-rec-reject-reason"
            className="fp-rec-reject-input"
            value={reasonDraft}
            onChange={(event) => setReasonDraft(event.target.value)}
            placeholder="Why doesn't this move make sense right now?"
            rows={2}
            disabled={busy}
          />
          <div className="fp-rec-actions">
            <button
              type="button"
              className="fp-button fp-rec-reject-confirm"
              disabled={busy || reasonDraft.trim().length === 0}
              onClick={confirmReject}
            >
              {pendingAction === "reject" ? "Rejecting…" : "Confirm reject"}
            </button>
            <button
              type="button"
              className="fp-button"
              disabled={busy}
              onClick={() => {
                setRejecting(false);
                setReasonDraft("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {actionError !== null ? (
        <p className="fp-rec-error" role="alert">
          {actionError}
        </p>
      ) : null}
    </section>
  );
}
