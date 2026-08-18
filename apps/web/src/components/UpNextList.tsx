import type { ProjectedQueueEntry } from "../lib/core";

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
              {entry.isSimulated ? <span className="fp-cold-start"> (simulated)</span> : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
