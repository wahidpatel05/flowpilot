import type { ProjectedTokenEta } from "../../lib/core";
import type { ConnectionState } from "../../lib/connectionState";
import { formatWaitMinutes } from "../../lib/formatMinutes";
import { ConnectionBadge } from "../ConnectionBadge";

/**
 * The Visitor's own Token: number, ETA (the dominant number) and people
 * ahead, all read from the engine's ProjectedTokenEta — this component
 * performs no ETA arithmetic of its own. `eta` is null once the Token has
 * left the queue (called, completed, or the demo was reset); `tokenNumber`
 * is carried separately from the joined session so it still renders then.
 */
export function TokenPanel({
  tokenNumber,
  eta,
  connection,
  onLeave,
}: {
  tokenNumber: string;
  eta: ProjectedTokenEta | null;
  connection: ConnectionState;
  onLeave: () => void;
}) {
  if (eta === null) {
    return (
      <section className="fp-visitor-card">
        <span className="fp-visitor-token-number">{tokenNumber}</span>
        <p className="fp-visitor-ended">
          This token is no longer waiting — you may have been called, or the
          queue was reset.
        </p>
        <button type="button" className="fp-visitor-button" onClick={onLeave}>
          Join another queue
        </button>
      </section>
    );
  }

  return (
    <section className="fp-visitor-card">
      <div className="fp-visitor-card-head">
        <span className="fp-visitor-token-number">{eta.tokenNumber}</span>
        <ConnectionBadge connection={connection} />
      </div>

      <div className="fp-visitor-eta" data-health={eta.health}>
        <span className="fp-visitor-eta-value">
          {formatWaitMinutes(eta.predictedWaitMinutes)}
        </span>
        <span className="fp-visitor-eta-unit">min</span>
      </div>
      <p className="fp-visitor-eta-range">
        {formatWaitMinutes(eta.etaLowerMinutes)}–{formatWaitMinutes(eta.etaUpperMinutes)} min range
      </p>

      <div className="fp-visitor-meta-row">
        <div className="fp-visitor-meta">
          <span className="fp-visitor-meta-label">People ahead</span>
          <span className="fp-visitor-meta-value">{eta.customersAhead}</span>
        </div>
        <div className="fp-visitor-meta">
          <span className="fp-visitor-meta-label">Health</span>
          <span className="fp-health" data-health={eta.health}>
            {eta.health}
          </span>
        </div>
      </div>

      {eta.isSimulated ? (
        <p className="fp-cold-start">Simulated demo token</p>
      ) : null}

      <button type="button" className="fp-visitor-leave" onClick={onLeave}>
        Leave this queue
      </button>
    </section>
  );
}
