import type { ControlServiceNode, HealthBreakdown } from "../lib/controlViewModel";
import { formatWaitMinutes } from "../lib/formatMinutes";
import { CounterBoard } from "./CounterBoard";
import { QueueLine } from "./QueueLine";
import { QueueStatusDonut } from "./QueueStatusDonut";
import { QueueTrendSparkline } from "./QueueTrendSparkline";
import { StatusPill } from "./StatusPill";

/**
 * The dashboard's "Live Queue Visualization" row: the featured Service drawn
 * as an actual line of people, who is now serving there, and the facility's
 * Health mix and trend alongside it. Every figure is read from the view model
 * or the trend buffer — nothing here recomputes an ETA or a Health band.
 */
export function LiveQueuePanel({
  featured,
  nowServingTokenNumber,
  totalCounters,
  healthBreakdown,
  waitHistory,
  onDrillIn,
}: {
  featured: ControlServiceNode | undefined;
  nowServingTokenNumber: string | null;
  totalCounters: number;
  healthBreakdown: HealthBreakdown;
  waitHistory: readonly number[];
  onDrillIn: (serviceId: string) => void;
}) {
  return (
    <section className="fp-panel fp-live-queue" aria-label="Live queue visualization">
      <div className="fp-live-queue-grid">
        <div className="fp-live-queue-featured">
          {featured === undefined ? (
            <p className="fp-callout-clear">No Service to show yet.</p>
          ) : (
            <>
              <div className="fp-live-queue-featured-head">
                <div>
                  <span className="fp-metric-label">{featured.name}</span>
                  <p className="fp-live-queue-wait">
                    {formatWaitMinutes(featured.now.waitMinutes)}
                    <span className="fp-metric-unit">min estimated wait</span>
                  </p>
                </div>
                <StatusPill health={featured.now.health} />
              </div>
              <QueueLine queueLength={featured.now.queueLength} />
              <button
                type="button"
                className="fp-drill-in"
                onClick={() => onDrillIn(featured.serviceId)}
              >
                Open queue detail
              </button>
              <CounterBoard
                nowServingTokenNumber={nowServingTokenNumber}
                activeCounters={featured.now.activeCounters}
                totalCounters={totalCounters}
              />
            </>
          )}
        </div>

        <div className="fp-live-queue-analytics">
          <div className="fp-live-queue-analytic">
            <span className="fp-metric-label">Queue status</span>
            <QueueStatusDonut breakdown={healthBreakdown} />
          </div>
          <div className="fp-live-queue-analytic">
            <span className="fp-metric-label">Wait trend (this session)</span>
            <QueueTrendSparkline points={waitHistory} />
          </div>
        </div>
      </div>
    </section>
  );
}
