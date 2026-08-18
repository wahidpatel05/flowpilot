"use client";

import { useMemo, useState } from "react";
import "./control.css";
import { useLiveFacility } from "../../hooks/useLiveFacility";
import { useDemoControls } from "../../hooks/useDemoControls";
import { buildControlViewModel } from "../../lib/controlViewModel";
import { ConnectionBadge } from "../../components/ConnectionBadge";
import { FlowGraph, type TwinMode } from "../../components/FlowGraph";
import { CriticalCallout } from "../../components/CriticalCallout";
import { FacilityTotals } from "../../components/FacilityTotals";
import { DemoControls } from "../../components/DemoControls";

export default function ControlPage() {
  const { projection, flowEdges, connection, error, refresh } = useLiveFacility();
  const [mode, setMode] = useState<TwinMode>("now");
  const demo = useDemoControls(refresh);

  const viewModel = useMemo(
    () =>
      projection === null
        ? null
        : buildControlViewModel({ projection, flowEdges }),
    [projection, flowEdges],
  );

  return (
    <main className="fp-control">
      <header className="fp-control-header">
        <div>
          <h1 className="fp-title">FlowPilot Control</h1>
          <p className="fp-subtitle">Facility operations · MHSSCE Student Services</p>
        </div>
        <div className="fp-control-header-right">
          <DemoControls controls={demo} />
          <ConnectionBadge connection={connection} />
        </div>
      </header>

      {error !== null ? (
        <div className="fp-error" role="alert">
          {error}
        </div>
      ) : null}

      {viewModel === null ? (
        <p className="fp-empty">Loading the facility…</p>
      ) : (
        <>
          <FacilityTotals totals={viewModel.totals} />

          <div className="fp-control-body">
            <section className="fp-twin" aria-label="Facility flow graph and digital twin">
              <div className="fp-twin-head">
                <div>
                  <h2 className="fp-twin-title">Facility Flow Graph</h2>
                  <p className="fp-twin-caption">
                    {mode === "now"
                      ? "Current state"
                      : `Predicted state · ${viewModel.horizonMinutes} min ahead`}
                  </p>
                </div>

                <div className="fp-toggle" role="group" aria-label="Twin mode">
                  <button
                    type="button"
                    className="fp-toggle-option"
                    data-active={mode === "now" ? "true" : undefined}
                    aria-pressed={mode === "now"}
                    onClick={() => setMode("now")}
                  >
                    Now
                  </button>
                  <button
                    type="button"
                    className="fp-toggle-option"
                    data-active={mode === "forecast" ? "true" : undefined}
                    aria-pressed={mode === "forecast"}
                    onClick={() => setMode("forecast")}
                  >
                    +{viewModel.horizonMinutes} min
                  </button>
                </div>
              </div>

              {mode === "forecast" ? (
                <p className="fp-forecast-banner">
                  <span className="fp-predicted-tag">Predicted</span> These are
                  forecast values from the simulation, not the present.
                </p>
              ) : null}

              <div className="fp-twin-canvas">
                <FlowGraph viewModel={viewModel} mode={mode} />
              </div>

              {viewModel.totals.simulatedWaiting > 0 ? (
                <p className="fp-simulated-banner">
                  {viewModel.totals.simulatedWaiting} of the{" "}
                  {viewModel.totals.visitorsWaiting} Visitors waiting are{" "}
                  <strong>simulated</strong> by Simulate Rush.
                </p>
              ) : null}
            </section>

            <aside className="fp-side">
              <CriticalCallout viewModel={viewModel} mode={mode} />
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
