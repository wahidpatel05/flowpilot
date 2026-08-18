import type { ProjectedService, QueueSnapshot } from "../lib/core";
import { formatWaitMinutes } from "../lib/formatMinutes";
import { Icon } from "./Icon";
import { QueueLine } from "./QueueLine";

/** The tile tints cycle so a grid of Services reads as a set, not a wall. */
const TINTS = ["yellow", "green", "purple", "pink", "orange"] as const;

/**
 * Every number here is read, never computed. Health, predicted wait and the
 * ETA range all come from the engine's QueueSnapshot; queue length, average
 * service time and Counter count come from the projection's ProjectedService.
 * This component performs no arithmetic of its own.
 */
export function ServiceCard({
  service,
  snapshot,
  index = 0,
}: {
  service: ProjectedService;
  snapshot: QueueSnapshot | undefined;
  /** Position in the grid, used only to stagger entrance and pick a tint. */
  index?: number;
}) {
  const health = snapshot?.health ?? "healthy";
  const predictedWait = snapshot?.predictedWaitMinutes ?? Number.POSITIVE_INFINITY;
  const tint = TINTS[index % TINTS.length];

  return (
    <article className="fp-card" style={{ animationDelay: `${index * 70}ms` }}>
      <div className="fp-card-head">
        <span className="fp-card-icon" data-tint={tint} aria-hidden="true">
          <Icon name="people" size={22} />
        </span>
        <span className="fp-health" data-health={health}>
          <span className="fp-health-dot" aria-hidden="true" />
          {health}
        </span>
      </div>

      <div>
        <h2 className="fp-service-name">{service.serviceName ?? service.serviceId}</h2>
        {service.slug ? <p className="fp-service-slug">{service.slug}</p> : null}
      </div>

      <QueueLine queueLength={service.queueLength} />

      <div className="fp-metric-row">
        <div className="fp-metric">
          <span className="fp-metric-label">In queue</span>
          <span className="fp-metric-value">
            {service.queueLength}
            {service.simulatedQueueLength > 0 ? (
              <span className="fp-metric-unit">({service.simulatedQueueLength} sim)</span>
            ) : null}
          </span>
        </div>

        <div className="fp-metric">
          <span className="fp-metric-label">Predicted wait</span>
          <span className="fp-metric-value" data-emphasis="wait">
            {formatWaitMinutes(predictedWait)}
            <span className="fp-metric-unit">min</span>
          </span>
        </div>

        <div className="fp-metric">
          <span className="fp-metric-label">Avg. service</span>
          <span className="fp-metric-value">
            {service.averageServiceMinutes.toFixed(1)}
            <span className="fp-metric-unit">min</span>
          </span>
          {service.isColdStart ? (
            <span className="fp-cold-start">cold start — using default</span>
          ) : null}
        </div>

        <div className="fp-metric">
          <span className="fp-metric-label">Counters</span>
          <span className="fp-metric-value">{service.activeCounters}</span>
        </div>
      </div>
    </article>
  );
}
