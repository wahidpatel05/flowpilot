import type { ProjectedQueueEntry } from "../lib/core";
import { SimulatedTag } from "./SimulatedTag";

export function UpNextList({ waiting }: { waiting: ProjectedQueueEntry[] }) {
  return (
    <div className="fp-card">
      <span className="fp-metric-label">Up next</span>
      {waiting.length === 0 ? (
        <p className="fp-empty">No one is waiting.</p>
      ) : (
        <ol className="fp-desk-up-next">
          {waiting.map((entry) => (
            <li key={entry.tokenId}>
              {entry.tokenNumber}
              {entry.isSimulated ? <SimulatedTag /> : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
