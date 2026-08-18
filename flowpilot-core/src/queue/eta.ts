/**
 * Queue engine — ETA and health. Pure, deterministic, dependency-free.
 * Spec §6 / §7.
 */
import type { QueueHealth, QueueSnapshot } from "../types.js";

/** Largest sample window used when blending recent service durations. */
export const MAX_RECENT_DURATION_SAMPLES = 30;
/** Weight given to observed recent durations in the blend. */
export const RECENT_DURATION_WEIGHT = 0.75;
/** Weight given to the configured default duration in the blend. */
export const DEFAULT_DURATION_WEIGHT = 0.25;
/** MVP ETA range spread (±15%). */
export const ETA_RANGE_SPREAD = 0.15;

export const DEFAULT_HEALTHY_THRESHOLD_MINUTES = 10;
export const DEFAULT_CRITICAL_THRESHOLD_MINUTES = 25;

export interface AverageServiceMinutesInput {
  /** Most recent completed-token durations, newest-last or newest-first. */
  recentDurationsMinutes: number[];
  /** service.default_service_minutes */
  defaultMinutes: number;
}

/**
 * Cold start (no samples) returns the configured default. Otherwise blends the
 * recent average 75/25 against the default, using at most the 30 most recent
 * samples.
 */
export function calculateAverageServiceMinutes(
  input: AverageServiceMinutesInput,
): number {
  const { recentDurationsMinutes, defaultMinutes } = input;
  const samples =
    recentDurationsMinutes.length > MAX_RECENT_DURATION_SAMPLES
      ? recentDurationsMinutes.slice(-MAX_RECENT_DURATION_SAMPLES)
      : recentDurationsMinutes;

  if (samples.length === 0) return defaultMinutes;

  let total = 0;
  for (const sample of samples) total += sample;
  const recentAverage = total / samples.length;

  return (
    recentAverage * RECENT_DURATION_WEIGHT +
    defaultMinutes * DEFAULT_DURATION_WEIGHT
  );
}

export interface EtaInput {
  customersAhead: number;
  averageServiceMinutes: number;
  activeCounters: number;
}

/** Predicted wait in minutes. No open counter means an unbounded wait. */
export function calculateEta(input: EtaInput): number {
  const { customersAhead, averageServiceMinutes, activeCounters } = input;
  if (activeCounters <= 0) return Number.POSITIVE_INFINITY;
  return (customersAhead * averageServiceMinutes) / activeCounters;
}

export interface EtaRange {
  lowerMinutes: number;
  upperMinutes: number;
}

/** ±15% band, clamped at zero and Infinity-safe. */
export function calculateEtaRange(etaMinutes: number): EtaRange {
  if (!Number.isFinite(etaMinutes)) {
    return {
      lowerMinutes: Number.POSITIVE_INFINITY,
      upperMinutes: Number.POSITIVE_INFINITY,
    };
  }
  const base = Math.max(0, etaMinutes);
  return {
    lowerMinutes: Math.max(0, base * (1 - ETA_RANGE_SPREAD)),
    upperMinutes: Math.max(0, base * (1 + ETA_RANGE_SPREAD)),
  };
}

export interface QueueHealthInput {
  predictedWaitMinutes: number;
  healthyThreshold?: number;
  criticalThreshold?: number;
}

export function calculateQueueHealth(input: QueueHealthInput): QueueHealth {
  const {
    predictedWaitMinutes,
    healthyThreshold = DEFAULT_HEALTHY_THRESHOLD_MINUTES,
    criticalThreshold = DEFAULT_CRITICAL_THRESHOLD_MINUTES,
  } = input;

  if (!Number.isFinite(predictedWaitMinutes)) return "critical";
  if (predictedWaitMinutes >= criticalThreshold) return "critical";
  if (predictedWaitMinutes <= healthyThreshold) return "healthy";
  return "busy";
}

export interface QueueSnapshotInput {
  serviceId: string;
  queueLength: number;
  activeCounters: number;
  /** Recent completed-token durations, if any. */
  recentDurationsMinutes?: number[];
  defaultServiceMinutes: number;
  healthyThreshold?: number;
  criticalThreshold?: number;
  arrivalRatePerMinute?: number;
}

/** Composes the ETA pipeline into the shared QueueSnapshot contract. */
export function buildQueueSnapshot(input: QueueSnapshotInput): QueueSnapshot {
  const averageServiceMinutes = calculateAverageServiceMinutes({
    recentDurationsMinutes: input.recentDurationsMinutes ?? [],
    defaultMinutes: input.defaultServiceMinutes,
  });

  const predictedWaitMinutes = calculateEta({
    customersAhead: input.queueLength,
    averageServiceMinutes,
    activeCounters: input.activeCounters,
  });

  const range = calculateEtaRange(predictedWaitMinutes);

  const snapshot: QueueSnapshot = {
    serviceId: input.serviceId,
    queueLength: input.queueLength,
    activeCounters: input.activeCounters,
    averageServiceMinutes,
    predictedWaitMinutes,
    etaLowerMinutes: range.lowerMinutes,
    etaUpperMinutes: range.upperMinutes,
    health: calculateQueueHealth({
      predictedWaitMinutes,
      healthyThreshold: input.healthyThreshold,
      criticalThreshold: input.criticalThreshold,
    }),
  };

  if (input.arrivalRatePerMinute !== undefined) {
    snapshot.arrivalRatePerMinute = input.arrivalRatePerMinute;
  }

  return snapshot;
}
