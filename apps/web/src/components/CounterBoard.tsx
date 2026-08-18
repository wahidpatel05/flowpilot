import { Icon } from "./Icon";

/** "Counter Board" — who's serving now, and how much of the floor is open. */
export function CounterBoard({
  nowServingTokenNumber,
  activeCounters,
  totalCounters,
}: {
  nowServingTokenNumber: string | null;
  activeCounters: number;
  totalCounters: number;
}) {
  return (
    <div className="fp-counter-board">
      <div className="fp-counter-board-row">
        <span className="fp-counter-board-icon" aria-hidden="true">
          <Icon name="counter" />
        </span>
        <div>
          <span className="fp-metric-label">Now serving</span>
          <p className="fp-counter-board-value">{nowServingTokenNumber ?? "—"}</p>
        </div>
      </div>
      <div className="fp-counter-board-row">
        <span className="fp-counter-board-icon" aria-hidden="true">
          <Icon name="people" />
        </span>
        <div>
          <span className="fp-metric-label">Counters open</span>
          <p className="fp-counter-board-value">
            {activeCounters}/{totalCounters}
          </p>
        </div>
      </div>
    </div>
  );
}
