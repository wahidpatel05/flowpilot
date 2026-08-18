/**
 * Everything Control needs to render, derived once and testable without a
 * browser. Components read this and lay it out; they compute nothing.
 *
 * "Now" values come from the projection's Queue Snapshots. "Forecast" values
 * come from the engine's `simulateFacility` — never from a second calculation
 * of our own. Both band Health with each Service's own thresholds, so one wait
 * value can't read `busy` now and `critical` in the forecast.
 */
import {
  calculateEta,
  findProjectedService,
  findQueueSnapshot,
  simulateFacility,
  type FacilityProjection,
  type ProjectedService,
  type QueueHealth,
  type ServiceFlowEdgeRow,
  type TokenStatus,
} from "./core";

/** How far ahead the Digital Twin forecasts, in minutes. */
export const DEFAULT_FORECAST_HORIZON_MINUTES = 15;

export interface ControlServiceState {
  queueLength: number;
  waitMinutes: number;
  health: QueueHealth;
}

/**
 * One Visitor still in line at a Service, with their own predicted wait — what
 * a Manager drilling into a queue number is actually looking for. The wait
 * comes from `calculateEta` for this Visitor's position, so a drill-in can
 * never disagree with the phone in their hand.
 */
export interface ControlQueueEntry {
  tokenId: string;
  tokenNumber: string;
  status: TokenStatus;
  /** Injected by Simulate Rush, and must stay visibly labelled. */
  isSimulated: boolean;
  /** 0-based place in line. */
  position: number;
  waitMinutes: number;
}

/**
 * The figures behind a Service's headline numbers, for drilling in. Everything
 * here is read off the projection — the drill-in derives nothing of its own.
 */
export interface ControlServiceDetail {
  /** `waiting` + `called`, in call order. */
  queue: ControlQueueEntry[];
  /** The part of `queueLength` from real Visitors. */
  realQueueLength: number;
  averageServiceMinutes: number;
  defaultServiceMinutes: number;
  /** How many completed durations fed the average. Zero means cold start. */
  completedDurationSampleCount: number;
  arrivalRatePerMinute: number;
  /** One hop of the Flow Graph: demand heading here from upstream. */
  downstreamArrivalRatePerMinute: number;
  healthyThresholdMinutes: number;
  criticalThresholdMinutes: number;
}

export interface ControlServiceNode {
  serviceId: string;
  name: string;
  slug: string | null;
  now: ControlServiceState & {
    activeCounters: number;
    /** Part of `queueLength` injected by Simulate Rush. */
    simulatedQueueLength: number;
  };
  forecast: ControlServiceState;
  /** TRUE when the average service time is still the configured default. */
  isColdStart: boolean;
  /** Column in the Flow Graph: 0 for entry Services, then one per hop. */
  layer: number;
  detail: ControlServiceDetail;
}

export interface ControlFlowEdge {
  fromServiceId: string;
  toServiceId: string;
  expectedShare: number;
}

export interface ControlTotals {
  /** Visitors currently in line across the whole facility. */
  visitorsWaiting: number;
  /** How many of those are simulated. */
  simulatedWaiting: number;
  /**
   * The wait an average waiting Visitor faces — weighted by queue length, not
   * a flat mean across Services, because a 40-minute queue of 20 people is not
   * equivalent to a 40-minute queue of one. Null when nobody is waiting or
   * every waiting queue has stalled.
   */
  averageWaitMinutes: number | null;
  /** Services with people waiting and no open Counter, so an unbounded wait. */
  servicesStalled: number;
}

/** How many Services sit in each Health band right now. Always sums to `services.length`. */
export interface HealthBreakdown {
  healthy: number;
  busy: number;
  critical: number;
}

export interface ControlViewModel {
  observedAtMillis: number;
  horizonMinutes: number;
  services: ControlServiceNode[];
  edges: ControlFlowEdge[];
  /** The Service to call out now, or null when none is critical. */
  criticalNow: string | null;
  /** The Service predicted to be critical at the horizon, or null. */
  criticalForecast: string | null;
  totals: ControlTotals;
  /** Widest `layer` value, so a renderer can size its columns. */
  maxLayer: number;
  /** Current (not forecast) Health band counts, for a status donut. */
  healthBreakdown: HealthBreakdown;
}

export interface BuildControlViewModelInput {
  projection: FacilityProjection;
  flowEdges?: readonly ServiceFlowEdgeRow[];
  horizonMinutes?: number;
}

/**
 * Assigns each Service a Flow Graph column: entry Services (nothing flows into
 * them) sit at 0, and every edge pushes its target at least one column right.
 * Iterates to a fixed point with a hard cap, so a cycle in the Flow Graph
 * degrades to a stable layout instead of looping forever.
 */
function assignLayers(
  serviceIds: readonly string[],
  edges: readonly ControlFlowEdge[],
): Map<string, number> {
  const known = new Set(serviceIds);
  const layers = new Map<string, number>();
  for (const id of serviceIds) layers.set(id, 0);

  const relevant = edges.filter(
    (edge) => known.has(edge.fromServiceId) && known.has(edge.toServiceId),
  );

  // A DAG settles in at most (nodes - 1) passes; the cap bounds cyclic input.
  const maxPasses = Math.max(1, serviceIds.length);
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    for (const edge of relevant) {
      const from = layers.get(edge.fromServiceId) ?? 0;
      const to = layers.get(edge.toServiceId) ?? 0;
      if (to < from + 1) {
        layers.set(edge.toServiceId, from + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return layers;
}

/**
 * Picks the Service to call out: critical ones only, worst wait first, with an
 * unbounded wait outranking any finite one. Ties break on serviceId so the
 * callout doesn't flicker between equals on every refresh.
 */
function pickCritical(
  candidates: readonly { serviceId: string; health: QueueHealth; waitMinutes: number }[],
): string | null {
  let worst: { serviceId: string; waitMinutes: number } | null = null;

  for (const candidate of candidates) {
    if (candidate.health !== "critical") continue;
    if (
      worst === null ||
      candidate.waitMinutes > worst.waitMinutes ||
      (candidate.waitMinutes === worst.waitMinutes &&
        candidate.serviceId < worst.serviceId)
    ) {
      worst = { serviceId: candidate.serviceId, waitMinutes: candidate.waitMinutes };
    }
  }

  return worst?.serviceId ?? null;
}

/**
 * The drill-in figures for one Service. Each waiting Visitor's own wait comes
 * from `calculateEta` at their position — the engine, called once per Visitor,
 * never a second ETA implementation of our own (INTEGRATION.md rule 1).
 */
function buildServiceDetail(detail: ProjectedService): ControlServiceDetail {
  return {
    queue: detail.queue.map((entry) => ({
      tokenId: entry.tokenId,
      tokenNumber: entry.tokenNumber,
      status: entry.status,
      isSimulated: entry.isSimulated,
      position: entry.position,
      waitMinutes: calculateEta({
        customersAhead: entry.position,
        averageServiceMinutes: detail.averageServiceMinutes,
        activeCounters: detail.activeCounters,
      }),
    })),
    realQueueLength: detail.realQueueLength,
    averageServiceMinutes: detail.averageServiceMinutes,
    defaultServiceMinutes: detail.defaultServiceMinutes,
    completedDurationSampleCount: detail.completedDurationSampleCount,
    arrivalRatePerMinute: detail.arrivalRatePerMinute,
    downstreamArrivalRatePerMinute: detail.downstreamArrivalRatePerMinute,
    healthyThresholdMinutes: detail.healthyThresholdMinutes,
    criticalThresholdMinutes: detail.criticalThresholdMinutes,
  };
}

export function buildControlViewModel(
  input: BuildControlViewModelInput,
): ControlViewModel {
  const { projection } = input;
  const horizonMinutes = input.horizonMinutes ?? DEFAULT_FORECAST_HORIZON_MINUTES;

  const forecast = simulateFacility({
    services: projection.services,
    horizonMinutes,
  });
  const forecastById = new Map(
    forecast.services.map((result) => [result.serviceId, result]),
  );

  const serviceIds = projection.serviceDetails.map((detail) => detail.serviceId);
  const knownIds = new Set(serviceIds);

  const edges: ControlFlowEdge[] = [];
  for (const row of input.flowEdges ?? []) {
    // An edge to a Service we don't hold would draw a line into nothing.
    if (!knownIds.has(row.from_service_id) || !knownIds.has(row.to_service_id)) {
      continue;
    }
    edges.push({
      fromServiceId: row.from_service_id,
      toServiceId: row.to_service_id,
      expectedShare: row.expected_share,
    });
  }

  const layers = assignLayers(serviceIds, edges);

  const services: ControlServiceNode[] = [];
  let visitorsWaiting = 0;
  let simulatedWaiting = 0;
  let weightedWaitTotal = 0;
  let weightedPeople = 0;
  let servicesStalled = 0;

  for (const detail of projection.serviceDetails) {
    const snapshot = findQueueSnapshot(projection, detail.serviceId);
    const simulated = forecastById.get(detail.serviceId);

    const nowWait = snapshot?.predictedWaitMinutes ?? Number.POSITIVE_INFINITY;
    const nowHealth = snapshot?.health ?? "critical";

    visitorsWaiting += detail.queueLength;
    simulatedWaiting += detail.simulatedQueueLength;

    if (detail.queueLength > 0) {
      if (Number.isFinite(nowWait)) {
        weightedWaitTotal += nowWait * detail.queueLength;
        weightedPeople += detail.queueLength;
      } else {
        servicesStalled += 1;
      }
    }

    services.push({
      serviceId: detail.serviceId,
      name: detail.serviceName ?? detail.serviceId,
      slug: detail.slug ?? null,
      now: {
        queueLength: detail.queueLength,
        simulatedQueueLength: detail.simulatedQueueLength,
        waitMinutes: nowWait,
        health: nowHealth,
        activeCounters: detail.activeCounters,
      },
      forecast: {
        queueLength: simulated?.finalQueueLength ?? detail.queueLength,
        waitMinutes: simulated?.finalWaitMinutes ?? nowWait,
        health: simulated?.health ?? nowHealth,
      },
      isColdStart: detail.isColdStart,
      layer: layers.get(detail.serviceId) ?? 0,
      detail: buildServiceDetail(detail),
    });
  }

  return {
    observedAtMillis: projection.observedAtMillis,
    horizonMinutes,
    services,
    edges,
    criticalNow: pickCritical(
      services.map((node) => ({
        serviceId: node.serviceId,
        health: node.now.health,
        waitMinutes: node.now.waitMinutes,
      })),
    ),
    criticalForecast: pickCritical(
      services.map((node) => ({
        serviceId: node.serviceId,
        health: node.forecast.health,
        waitMinutes: node.forecast.waitMinutes,
      })),
    ),
    totals: {
      visitorsWaiting,
      simulatedWaiting,
      averageWaitMinutes:
        weightedPeople > 0 ? weightedWaitTotal / weightedPeople : null,
      servicesStalled,
    },
    maxLayer: services.reduce((max, node) => Math.max(max, node.layer), 0),
    healthBreakdown: services.reduce<HealthBreakdown>(
      (breakdown, node) => {
        breakdown[node.now.health] += 1;
        return breakdown;
      },
      { healthy: 0, busy: 0, critical: 0 },
    ),
  };
}

/** Looks up one node without a surface hand-rolling a `.find()`. */
export function findControlNode(
  viewModel: ControlViewModel,
  serviceId: string | null,
): ControlServiceNode | undefined {
  if (serviceId === null) return undefined;
  return viewModel.services.find((node) => node.serviceId === serviceId);
}

/**
 * The Service the "Live Queue Visualization" panel should feature: whichever
 * one is critical now, or — when nothing is — the one carrying the longest
 * line, so the panel never goes blank just because nothing has crossed the
 * critical threshold yet. Undefined only when there are no Services at all.
 */
export function pickFeaturedService(viewModel: ControlViewModel): ControlServiceNode | undefined {
  const critical = findControlNode(viewModel, viewModel.criticalNow);
  if (critical !== undefined) return critical;
  return viewModel.services.reduce<ControlServiceNode | undefined>((best, node) => {
    if (best === undefined) return node;
    return node.now.queueLength > best.now.queueLength ? node : best;
  }, undefined);
}

/** Re-exported so components never reach past this module into the engine. */
export { findProjectedService };
