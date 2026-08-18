import type { EtaImprovement } from "../hooks/useEtaImprovement";
import { formatWaitMinutes } from "../lib/formatMinutes";

/** "ETA Improvement Animation": the wait ticking down, with a small celebration. */
export function EtaImprovementBadge({ improvement }: { improvement: EtaImprovement }) {
  return (
    <div className="fp-eta-improvement" key={improvement.atMillis} role="status">
      <span className="fp-eta-improvement-numbers">
        <span className="fp-eta-improvement-from">{formatWaitMinutes(improvement.fromMinutes)} min</span>
        <span className="fp-eta-improvement-arrow" aria-hidden="true">
          →
        </span>
        <span className="fp-eta-improvement-to">{formatWaitMinutes(improvement.toMinutes)} min</span>
      </span>
      <span className="fp-eta-improvement-tag">✨ Your wait just got shorter!</span>
    </div>
  );
}
