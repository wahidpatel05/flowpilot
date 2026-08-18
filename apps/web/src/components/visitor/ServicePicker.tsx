import type { ProjectedService, QueueSnapshot } from "../../lib/core";
import { formatWaitMinutes } from "../../lib/formatMinutes";

/**
 * A plain list — no natural-language routing (ADR-0004 insurance scope).
 * Wait and Health are read from the snapshot, never computed here.
 */
export function ServicePicker({
  services,
  snapshots,
  onJoin,
  isJoining,
}: {
  services: ProjectedService[];
  snapshots: Map<string, QueueSnapshot | undefined>;
  onJoin: (serviceId: string, serviceSlug: string | undefined) => void;
  isJoining: boolean;
}) {
  if (services.length === 0) {
    return <p className="fp-empty">No Services are available yet.</p>;
  }

  return (
    <ul className="fp-visitor-service-list">
      {services.map((service) => {
        const snapshot = snapshots.get(service.serviceId);
        const health = snapshot?.health ?? "healthy";
        const wait = snapshot?.predictedWaitMinutes ?? Number.POSITIVE_INFINITY;

        return (
          <li key={service.serviceId}>
            <button
              type="button"
              className="fp-visitor-service-button"
              disabled={isJoining}
              onClick={() => onJoin(service.serviceId, service.slug)}
            >
              <span className="fp-visitor-service-name">
                {service.serviceName ?? service.serviceId}
              </span>
              <span className="fp-visitor-service-meta">
                <span className="fp-health" data-health={health}>
                  {health}
                </span>
                <span className="fp-visitor-service-wait">
                  {formatWaitMinutes(wait)} min wait
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
