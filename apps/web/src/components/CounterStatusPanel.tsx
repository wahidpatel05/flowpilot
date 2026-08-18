import type { CounterStatus } from "../lib/core";
import { counterLabel } from "../lib/counterLabel";

export function CounterStatusPanel({
  counterName,
  status,
  serviceName,
  busy,
  onToggle,
}: {
  counterName: string;
  status: CounterStatus;
  serviceName: string | null;
  busy: boolean;
  onToggle: () => void;
}) {
  const isActive = status === "active";
  // Same wording as the picker, so the desk a clerk chose and the desk they
  // are looking at are named identically.
  const label = counterLabel({ counterName, serviceName });

  return (
    <div className="fp-card fp-desk-status-card">
      <div className="fp-card-head">
        <div>
          <h2 className="fp-service-name">{label.primary}</h2>
          <p className="fp-service-slug">{label.secondary}</p>
        </div>
        <span className="fp-health" data-health={isActive ? "healthy" : "busy"}>
          <span className="fp-health-dot" aria-hidden="true" />
          {isActive ? "active" : "inactive"}
        </span>
      </div>
      <button
        type="button"
        className="fp-btn fp-desk-button"
        data-variant={isActive ? "primary" : "purple"}
        onClick={onToggle}
        disabled={busy}
      >
        {isActive ? "Go inactive" : "Go active"}
      </button>
    </div>
  );
}
