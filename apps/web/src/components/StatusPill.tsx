import type { QueueHealth } from "../lib/core";

const LABEL: Record<QueueHealth, string> = {
  healthy: "Healthy",
  busy: "Busy",
  critical: "Critical",
};

/** Dot + word, never colour alone — the shared Health vocabulary from CONTEXT.md. */
export function StatusPill({ health }: { health: QueueHealth }) {
  return (
    <span className="fp-status-pill" data-health={health}>
      <span className="fp-status-dot" aria-hidden="true" />
      {LABEL[health]}
    </span>
  );
}
