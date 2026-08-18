"use client";

import type { ControlServiceNode } from "../lib/controlViewModel";
import { formatWaitMinutes } from "../lib/formatMinutes";
import { Modal } from "./Modal";
import { StatusPill } from "./StatusPill";

/** `waiting` and `called` are the only two statuses still in line. */
const QUEUE_STATUS_LABEL: Readonly<Record<string, string>> = {
  waiting: "Waiting",
  called: "Called",
};

function formatRate(perMinute: number): string {
  if (!Number.isFinite(perMinute) || perMinute <= 0) return "0";
  return (perMinute * 60).toFixed(1);
}

/**
 * Drilling into a number. Every headline figure on this page is an aggregate,
 * and a Manager challenged on one needs to see what it is made of: who is in
 * line, where each Visitor sits, what each of them is being told to expect,
 * and the thresholds the Health band was decided against.
 *
 * Reads the view model only. Each Visitor's own wait was computed by the engine
 * when the view model was built, so this drill-in can never disagree with the
 * ETA on the phone in their hand.
 */
export function ServiceQueueDetail({
  service,
  nowServingTokenNumber,
  horizonMinutes,
  onClose,
}: {
  service: ControlServiceNode;
  nowServingTokenNumber: string | null;
  horizonMinutes: number;
  onClose: () => void;
}) {
  const { detail } = service;

  return (
    <Modal title={`${service.name} — queue detail`} onClose={onClose}>
      <div className="fp-queue-detail">
        <div className="fp-queue-detail-head">
          <div>
            <p className="fp-queue-detail-wait">
              {formatWaitMinutes(service.now.waitMinutes)}
              <span className="fp-metric-unit">min estimated wait</span>
            </p>
            <p className="fp-queue-detail-sub">
              {service.now.queueLength} in line · {service.now.activeCounters} counter
              {service.now.activeCounters === 1 ? "" : "s"} open
              {nowServingTokenNumber !== null ? ` · now serving ${nowServingTokenNumber}` : ""}
            </p>
          </div>
          <StatusPill health={service.now.health} />
        </div>

        <dl className="fp-queue-detail-facts">
          <div className="fp-queue-detail-fact">
            <dt>In {horizonMinutes} min</dt>
            <dd>
              {formatWaitMinutes(service.forecast.waitMinutes)} min ·{" "}
              {service.forecast.queueLength} in line
            </dd>
          </div>
          <div className="fp-queue-detail-fact">
            <dt>Average service time</dt>
            <dd>
              {detail.averageServiceMinutes.toFixed(1)} min
              {service.isColdStart
                ? ` (default — no completed visits yet)`
                : ` (from ${detail.completedDurationSampleCount} completed)`}
            </dd>
          </div>
          <div className="fp-queue-detail-fact">
            <dt>Arriving</dt>
            <dd>
              {formatRate(detail.arrivalRatePerMinute)}/hr direct ·{" "}
              {formatRate(detail.downstreamArrivalRatePerMinute)}/hr from upstream
            </dd>
          </div>
          <div className="fp-queue-detail-fact">
            <dt>Health thresholds</dt>
            <dd>
              healthy under {detail.healthyThresholdMinutes} min · critical over{" "}
              {detail.criticalThresholdMinutes} min
            </dd>
          </div>
          <div className="fp-queue-detail-fact">
            <dt>Real vs simulated</dt>
            <dd>
              {detail.realQueueLength} real
              {service.now.simulatedQueueLength > 0
                ? ` · ${service.now.simulatedQueueLength} simulated by Simulate Rush`
                : ""}
            </dd>
          </div>
        </dl>

        {detail.queue.length === 0 ? (
          <p className="fp-callout-clear">Nobody is in line at this Service.</p>
        ) : (
          <>
            <h4 className="fp-queue-detail-title">In line now</h4>
            <ol className="fp-queue-detail-list">
              {detail.queue.map((entry) => (
                <li key={entry.tokenId} className="fp-queue-detail-row">
                  <span className="fp-queue-detail-position">{entry.position + 1}</span>
                  <span className="fp-queue-detail-token">
                    {entry.tokenNumber}
                    {entry.isSimulated ? (
                      <span className="fp-predicted-tag">Simulated</span>
                    ) : null}
                  </span>
                  <span className="fp-queue-detail-status">
                    {QUEUE_STATUS_LABEL[entry.status] ?? entry.status}
                  </span>
                  <span className="fp-queue-detail-eta">
                    {formatWaitMinutes(entry.waitMinutes)} min
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </Modal>
  );
}
