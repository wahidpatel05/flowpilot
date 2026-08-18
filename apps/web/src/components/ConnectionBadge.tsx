import type { ConnectionState } from "../lib/connectionState";

const LABEL: Record<ConnectionState["phase"], string> = {
  live: "Live",
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  polling: "Live (polling)",
};

/**
 * The one indicator on the page that tells a Manager whether to trust the
 * numbers below. "polling" is not an error state — it is the fallback
 * working as designed after Realtime degraded.
 */
export function ConnectionBadge({ connection }: { connection: ConnectionState }) {
  return (
    <span className="fp-connection" data-phase={connection.phase}>
      <span className="fp-connection-dot" aria-hidden="true" />
      {LABEL[connection.phase]}
    </span>
  );
}
