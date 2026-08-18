import type { ProjectedService, QueueSnapshot } from "../lib/core";

function formatWait(minutes: number): string {
  if (!Number.isFinite(minutes)) return "—";
  if (minutes < 1) return "<1";
  return Math.round(minutes).toString();
}

/**
 * Every number here is read, never computed. Health, predicted wait and the
 * ETA range all come from the engine's QueueSnapshot; queue length, average
 * service time and Counter count come from the projection's ProjectedService.
 * This component performs no arithmetic of its own.
 */
export function ServiceCard({
  service,
  snapshot,
}: {
  service: ProjectedService;
  snapshot: QueueSnapshot | undefined;
}) {
  const health = snapshot?.health ?? "healthy";
  const predictedWait = snapshot?.predictedWaitMinutes ?? Number.POSITIVE_INFINITY;

  return (
    <article className="fp-card">
      <div className="fp-card-head">
        <div>
          <h2 className="fp-service-name">{service.serviceName ?? service.serviceId}</h2>
          {service.slug ? <p className="fp-service-slug">{service.slug}</p> : null}
        </div>
        <span className="fp-health" data-health={health}>
          <span className="fp-health-dot" aria-hidden="true" />
          {health}
        </span>
      </div>

      <div className="fp-metric-row">
        <div className="fp-metric">
          <span className="fp-metric-label">Queue length</span>
          <span className="fp-metric-value">
            {service.queueLength}
            {service.simulatedQueueLength > 0 ? (
              <span className="fp-metric-unit">({service.simulatedQueueLength} simulated)</span>
            ) : null}
          </span>
        </div>

        <div className="fp-metric">
          <span className="fp-metric-label">Predicted wait</span>
          <span className="fp-metric-value" data-emphasis="wait">
            {formatWait(predictedWait)}
            <span className="fp-metric-unit">min</span>
          </span>
        </div>

        <div className="fp-metric">
          <span className="fp-metric-label">Avg. service time</span>
          <span className="fp-metric-value">
            {service.averageServiceMinutes.toFixed(1)}
            <span className="fp-metric-unit">min</span>
          </span>
          {service.isColdStart ? <span className="fp-cold-start">cold start — using default</span> : null}
        </div>

        <div className="fp-metric">
          <span className="fp-metric-label">Active Counters</span>
          <span className="fp-metric-value">{service.activeCounters}</span>
        </div>
      </div>
    </article>
  );
}
