import { assignmentDurationMinutes, type InterventionRow } from "../lib/interventionTarget";

/**
 * The consent step CONTEXT.md requires: DeQueue is not allowed to move a
 * human silently, so this renders before capacity ever changes and Accept is
 * the only thing that lets it proceed.
 */
export function IncomingAssignmentCard({
  assignment,
  destinationServiceName,
  busy,
  onAccept,
}: {
  assignment: InterventionRow;
  destinationServiceName: string;
  busy: boolean;
  onAccept: () => void;
}) {
  const durationMinutes = assignmentDurationMinutes(assignment);

  return (
    <div className="fp-card fp-desk-incoming">
      <span className="fp-metric-label">Incoming Assignment</span>
      <p className="fp-desk-incoming-message">
        DeQueue wants to move you to <strong>{destinationServiceName}</strong> for the next{" "}
        <strong>{durationMinutes} minutes</strong>.
      </p>
      <button
        type="button"
        className="fp-btn fp-desk-button"
        data-variant="primary"
        onClick={onAccept}
        disabled={busy}
      >
        Accept
      </button>
    </div>
  );
}
