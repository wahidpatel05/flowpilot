"use client";

import type { DemoControls as DemoControlsState } from "../hooks/useDemoControls";

/**
 * Simulate Rush and Reset Demo. Both go through the database RPCs, so a
 * rehearsal leaves the facility in exactly the state the golden-path script
 * and the seed expect.
 */
export function DemoControls({ controls }: { controls: DemoControlsState }) {
  const busy = controls.pending !== null;

  return (
    <section className="fp-demo" aria-label="Demo controls">
      <div className="fp-demo-buttons">
        <button
          type="button"
          className="fp-button"
          data-variant="rush"
          disabled={busy}
          onClick={() => controls.run("simulate_rush")}
        >
          {controls.pending === "simulate_rush" ? "Simulating…" : "Simulate Rush"}
        </button>

        <button
          type="button"
          className="fp-button"
          disabled={busy}
          onClick={() => controls.run("reset_demo")}
        >
          {controls.pending === "reset_demo" ? "Resetting…" : "Reset Demo"}
        </button>
      </div>

      {controls.error !== null ? (
        <p className="fp-demo-message" data-tone="error" role="alert">
          {controls.error}
        </p>
      ) : controls.lastResult !== null ? (
        <p className="fp-demo-message" aria-live="polite">
          {controls.lastResult}
        </p>
      ) : null}
    </section>
  );
}
