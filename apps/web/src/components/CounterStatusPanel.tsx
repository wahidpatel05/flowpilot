import type { CounterStatus } from "../lib/core";

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

  return (
    <div className="fp-card fp-desk-status-card">
      <div className="fp-card-head">
        <div>
          <h2 className="fp-service-name">{counterName}</h2>
          <p className="fp-service-slug">{serviceName ?? "Unassigned"}</p>
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
