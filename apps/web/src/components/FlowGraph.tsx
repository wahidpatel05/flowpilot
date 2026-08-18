"use client";

import type { ControlServiceNode, ControlViewModel } from "../lib/controlViewModel";

/** Which set of numbers the Twin is showing. */
export type TwinMode = "now" | "forecast";

const NODE_WIDTH = 210;
const NODE_HEIGHT = 128;
const COLUMN_GAP = 96;
const ROW_GAP = 28;
const PADDING = 20;

/** Health rendered as a word and a shape, never colour alone. */
const HEALTH_GLYPH = {
  healthy: "▲",
  busy: "◆",
  critical: "■",
} as const;

function formatWait(minutes: number): string {
  if (!Number.isFinite(minutes)) return "stalled";
  if (minutes < 1) return "<1 min";
  return `${Math.round(minutes)} min`;
}

function formatQueue(count: number): string {
  // Forecast queue lengths are fluid, so they can be fractional.
  return Number.isInteger(count) ? String(count) : count.toFixed(1);
}

interface Placed {
  node: ControlServiceNode;
  x: number;
  y: number;
}

/**
 * Places nodes in columns by `layer`, stacking Services that share a column.
 * Layout is derived from the view model's layers — the graph shape comes from
 * the Flow Graph edges in the database, not from hardcoded positions.
 */
function place(viewModel: ControlViewModel): { placed: Placed[]; width: number; height: number } {
  const byLayer = new Map<number, ControlServiceNode[]>();
  for (const node of viewModel.services) {
    const bucket = byLayer.get(node.layer);
    if (bucket === undefined) byLayer.set(node.layer, [node]);
    else bucket.push(node);
  }

  const tallestColumn = Math.max(
    1,
    ...Array.from(byLayer.values(), (bucket) => bucket.length),
  );

  const placed: Placed[] = [];
  for (const [layer, bucket] of byLayer) {
    const columnHeight = bucket.length * NODE_HEIGHT + (bucket.length - 1) * ROW_GAP;
    const fullHeight = tallestColumn * NODE_HEIGHT + (tallestColumn - 1) * ROW_GAP;
    const offsetY = (fullHeight - columnHeight) / 2;

    bucket.forEach((node, index) => {
      placed.push({
        node,
        x: PADDING + layer * (NODE_WIDTH + COLUMN_GAP),
        y: PADDING + offsetY + index * (NODE_HEIGHT + ROW_GAP),
      });
    });
  }

  return {
    placed,
    width: PADDING * 2 + (viewModel.maxLayer + 1) * NODE_WIDTH + viewModel.maxLayer * COLUMN_GAP,
    height:
      PADDING * 2 + tallestColumn * NODE_HEIGHT + (tallestColumn - 1) * ROW_GAP,
  };
}

export function FlowGraph({
  viewModel,
  mode,
}: {
  viewModel: ControlViewModel;
  mode: TwinMode;
}) {
  const { placed, width, height } = place(viewModel);
  const positionById = new Map(placed.map((entry) => [entry.node.serviceId, entry]));
  const criticalId = mode === "now" ? viewModel.criticalNow : viewModel.criticalForecast;

  return (
    <svg
      className="fp-twin-svg"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={
        mode === "now"
          ? "Facility flow graph, current state"
          : `Facility flow graph, predicted state in ${viewModel.horizonMinutes} minutes`
      }
    >
      <defs>
        <marker
          id="fp-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--fp-muted)" />
        </marker>
      </defs>

      {/* Edges first, so nodes sit on top of them. */}
      {viewModel.edges.map((edge) => {
        const from = positionById.get(edge.fromServiceId);
        const to = positionById.get(edge.toServiceId);
        if (from === undefined || to === undefined) return null;

        const x1 = from.x + NODE_WIDTH;
        const y1 = from.y + NODE_HEIGHT / 2;
        const x2 = to.x;
        const y2 = to.y + NODE_HEIGHT / 2;
        const midX = (x1 + x2) / 2;

        return (
          <g key={`${edge.fromServiceId}->${edge.toServiceId}`} className="fp-edge">
            <path
              d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke="var(--fp-muted)"
              strokeWidth={1 + edge.expectedShare * 2.5}
              strokeOpacity={0.35 + edge.expectedShare * 0.35}
              markerEnd="url(#fp-arrow)"
            />
            <text
              x={midX}
              y={(y1 + y2) / 2 - 8}
              textAnchor="middle"
              className="fp-edge-label"
            >
              {Math.round(edge.expectedShare * 100)}%
            </text>
          </g>
        );
      })}

      {placed.map(({ node, x, y }) => {
        const state = mode === "now" ? node.now : node.forecast;
        const isCritical = node.serviceId === criticalId;

        return (
          <g
            key={node.serviceId}
            transform={`translate(${x} ${y})`}
            className="fp-node"
            data-health={state.health}
            data-critical={isCritical ? "true" : undefined}
          >
            <rect
              width={NODE_WIDTH}
              height={NODE_HEIGHT}
              rx={14}
              className="fp-node-box"
            />

            <text x={16} y={26} className="fp-node-name">
              {node.name}
            </text>

            <text x={16} y={62} className="fp-node-wait">
              {formatWait(state.waitMinutes)}
            </text>

            <text x={16} y={86} className="fp-node-queue">
              {formatQueue(state.queueLength)} waiting
              {mode === "now" && node.now.simulatedQueueLength > 0
                ? ` · ${node.now.simulatedQueueLength} simulated`
                : ""}
            </text>

            <text x={16} y={110} className="fp-node-health">
              {HEALTH_GLYPH[state.health]} {state.health}
              {mode === "now" ? ` · ${node.now.activeCounters} open` : ""}
            </text>

            {isCritical ? (
              <text x={NODE_WIDTH - 16} y={26} textAnchor="end" className="fp-node-flag">
                CRITICAL
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
