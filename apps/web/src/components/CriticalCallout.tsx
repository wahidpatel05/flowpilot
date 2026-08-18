"use client";

import { findControlNode, type ControlViewModel } from "../lib/controlViewModel";
import type { TwinMode } from "./FlowGraph";

function formatWait(minutes: number): string {
  if (!Number.isFinite(minutes)) return "an unbounded wait";
  return `${Math.round(minutes)} min`;
}

/**
 * Names the Service under pressure in a sentence, so a Manager is handed a
 * conclusion instead of being asked to compare nodes by eye.
 */
export function CriticalCallout({
  viewModel,
  mode,
}: {
  viewModel: ControlViewModel;
  mode: TwinMode;
}) {
  const nowNode = findControlNode(viewModel, viewModel.criticalNow);
  const forecastNode = findControlNode(viewModel, viewModel.criticalForecast);

  if (nowNode === undefined && forecastNode === undefined) {
    return (
      <section className="fp-panel" aria-live="polite">
        <h2 className="fp-panel-title">Critical Service</h2>
        <p className="fp-callout-clear">
          <span className="fp-health-dot" aria-hidden="true" /> No Service is critical.
        </p>
      </section>
    );
  }

  // Pressure that hasn't formed yet is the more useful headline when the
  // Manager is looking at the forecast, or when only the forecast is critical.
  const emphasiseForecast = mode === "forecast" || nowNode === undefined;

  return (
    <section className="fp-panel" data-critical="true" aria-live="polite">
      <h2 className="fp-panel-title">Critical Service</h2>

      {nowNode !== undefined ? (
        <p className="fp-callout-line">
          <strong className="fp-callout-name">{nowNode.name}</strong> is critical now
          at {formatWait(nowNode.now.waitMinutes)} on {nowNode.now.activeCounters}{" "}
          {nowNode.now.activeCounters === 1 ? "Counter" : "Counters"}.
        </p>
      ) : null}

      {forecastNode !== undefined ? (
        <p
          className="fp-callout-line"
          data-emphasis={emphasiseForecast ? "true" : undefined}
        >
          <span className="fp-predicted-tag">Predicted</span>{" "}
          <strong className="fp-callout-name">{forecastNode.name}</strong> at{" "}
          {formatWait(forecastNode.forecast.waitMinutes)} in{" "}
          {viewModel.horizonMinutes} min.
        </p>
      ) : nowNode !== undefined ? (
        <p className="fp-callout-line">
          <span className="fp-predicted-tag">Predicted</span> No Service is critical
          in {viewModel.horizonMinutes} min.
        </p>
      ) : null}
    </section>
  );
}
