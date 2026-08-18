/**
 * How long a Visitor has been at a Counter, for the Desk's Now Serving timer.
 * Pure so it can tick every second in a component without touching the network.
 */
export function formatElapsedMinutes(startedAtMillis: number, nowMillis: number): string {
  const elapsedSeconds = Math.max(0, Math.floor((nowMillis - startedAtMillis) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
