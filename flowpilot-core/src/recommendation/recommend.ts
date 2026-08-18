/**
 * Recommendation engine — Spec §10.
 *
 * The movable unit is an *assignment*: a (staff, counter, service) binding.
 * Physical counters never move, so there are exactly two action types:
 *   P1 activate_counter — bind an IDLE skilled staff member to an INACTIVE
 *      counter that is eligible for the pressured service.
 *   P2 reassign_staff   — temporarily rebind an ACTIVE skilled staff member
 *      from a low-pressure service to the pressured service.
 *
 * Every candidate is scored by running the WHOLE-FACILITY simulator twice:
 * once on the baseline state and once on the candidate state. A reassignment
 * therefore pays the full cost of the counter it removes from the source
 * service — the destination gain is never evaluated in isolation.
 */
import type {
  ActivateCounterPayload,
  FacilityServiceState,
  Recommendation,
  RecommendationInput,
  ReassignStaffPayload,
  SimulationResult,
} from "../types.js";
import { simulateFacility } from "../simulation/simulate.js";
import { calculateEta } from "../queue/eta.js";
import { estimateMinutesReturned } from "../metrics/timeReturned.js";

export const DEFAULT_SIMULATION_HORIZON_MINUTES = 60;
export const DEFAULT_TEMPORARY_DURATION_MINUTES = 30;
/** A service must keep at least this many active counters after a move. */
export const MIN_ACTIVE_COUNTERS_AFTER_MOVE = 1;

const HIGH_CONFIDENCE_MARGIN_RATIO = 0.5;
const MEDIUM_CONFIDENCE_MARGIN_RATIO = 0.15;

interface Candidate {
  actionType: "activate_counter" | "reassign_staff";
  payload: ActivateCounterPayload | ReassignStaffPayload;
  services: FacilityServiceState[];
  /** Generation priority: 1 = P1, 2 = P2. Lower wins ties. */
  priority: number;
}

interface ScoredCandidate extends Candidate {
  score: number;
  result: SimulationResult;
}

function predictedWait(service: FacilityServiceState): number {
  return calculateEta({
    customersAhead: service.queueLength,
    averageServiceMinutes: service.averageServiceMinutes,
    activeCounters: service.activeCounters,
  });
}

/** The service under the most pressure right now. Deterministic tie-break. */
export function findPressuredService(
  services: FacilityServiceState[],
): FacilityServiceState | undefined {
  let best: FacilityServiceState | undefined;
  let bestWait = -1;
  for (const service of services) {
    const wait = predictedWait(service);
    if (
      best === undefined ||
      wait > bestWait ||
      (wait === bestWait && service.serviceId < best.serviceId)
    ) {
      best = service;
      bestWait = wait;
    }
  }
  return best;
}

function isCounterEligibleFor(
  counter: { serviceId?: string; eligibleServiceIds?: string[] },
  serviceId: string,
): boolean {
  if (counter.eligibleServiceIds !== undefined) {
    return counter.eligibleServiceIds.includes(serviceId);
  }
  if (counter.serviceId !== undefined) return counter.serviceId === serviceId;
  return true;
}

function cloneServices(
  services: FacilityServiceState[],
): FacilityServiceState[] {
  return services.map((service) => ({ ...service }));
}

function adjustCounters(
  services: FacilityServiceState[],
  serviceId: string,
  delta: number,
): FacilityServiceState[] {
  return services.map((service) =>
    service.serviceId === serviceId
      ? { ...service, activeCounters: service.activeCounters + delta }
      : service,
  );
}

function serviceResult(result: SimulationResult, serviceId: string) {
  return result.services.find((entry) => entry.serviceId === serviceId);
}

function confidenceFromMargin(
  best: number,
  secondBest: number,
): "low" | "medium" | "high" {
  if (best <= 0) return "low";
  const ratio = (best - secondBest) / best;
  if (ratio >= HIGH_CONFIDENCE_MARGIN_RATIO) return "high";
  if (ratio >= MEDIUM_CONFIDENCE_MARGIN_RATIO) return "medium";
  return "low";
}

/**
 * Generates, simulates and scores every legal intervention, returning the
 * highest positive-scoring one — or null when no move helps.
 */
export function recommendIntervention(
  input: RecommendationInput,
): Recommendation | null {
  const horizonMinutes =
    input.horizonMinutes ?? DEFAULT_SIMULATION_HORIZON_MINUTES;
  const durationMinutes =
    input.durationMinutes ?? DEFAULT_TEMPORARY_DURATION_MINUTES;

  const target =
    input.pressuredServiceId !== undefined
      ? input.services.find(
          (service) => service.serviceId === input.pressuredServiceId,
        )
      : findPressuredService(input.services);

  if (target === undefined) return null;

  const skilledStaffIds = new Set(
    input.staffSkills
      .filter((skill) => skill.serviceId === target.serviceId)
      .map((skill) => skill.staffId),
  );
  if (skilledStaffIds.size === 0) return null;

  const baselineServices = cloneServices(input.services);
  const baseline = simulateFacility({
    services: baselineServices,
    horizonMinutes,
  });

  const candidates: Candidate[] = [];

  // ---- P1: activate an inactive counter with an idle skilled staff member.
  const inactiveCounters = input.counters
    .filter(
      (counter) =>
        counter.status === "inactive" &&
        isCounterEligibleFor(counter, target.serviceId),
    )
    .sort((a, b) => (a.counterId < b.counterId ? -1 : 1));

  const idleSkilledStaff = input.staff
    .filter(
      (member) =>
        member.availability === "idle" && skilledStaffIds.has(member.staffId),
    )
    .sort((a, b) => (a.staffId < b.staffId ? -1 : 1));

  for (const counter of inactiveCounters) {
    for (const member of idleSkilledStaff) {
      const payload: ActivateCounterPayload = {
        counterId: counter.counterId,
        staffId: member.staffId,
        serviceId: target.serviceId,
        durationMinutes,
      };
      candidates.push({
        actionType: "activate_counter",
        payload,
        services: adjustCounters(baselineServices, target.serviceId, 1),
        priority: 1,
      });
    }
  }

  // ---- P2: temporarily rebind an active skilled staff member.
  const activeSkilledStaff = input.staff
    .filter(
      (member) =>
        member.availability === "active" &&
        skilledStaffIds.has(member.staffId) &&
        member.currentServiceId !== undefined &&
        member.currentServiceId !== target.serviceId,
    )
    .sort((a, b) => (a.staffId < b.staffId ? -1 : 1));

  for (const member of activeSkilledStaff) {
    const fromServiceId = member.currentServiceId;
    if (fromServiceId === undefined) continue;

    const source = input.services.find(
      (service) => service.serviceId === fromServiceId,
    );
    if (source === undefined) continue;

    // The source service must remain operational after losing this staffer.
    if (source.activeCounters - 1 < MIN_ACTIVE_COUNTERS_AFTER_MOVE) continue;

    const counterId =
      member.currentCounterId ??
      input.counters.find(
        (counter) =>
          counter.staffId === member.staffId && counter.status === "active",
      )?.counterId;
    if (counterId === undefined) continue;

    const payload: ReassignStaffPayload = {
      staffId: member.staffId,
      counterId,
      fromServiceId,
      toServiceId: target.serviceId,
      durationMinutes,
    };

    // Full cost: the source service loses a counter, destination gains one.
    const moved = adjustCounters(
      adjustCounters(baselineServices, fromServiceId, -1),
      target.serviceId,
      1,
    );

    candidates.push({
      actionType: "reassign_staff",
      payload,
      services: moved,
      priority: 2,
    });
  }

  // ---- Score every candidate against the whole facility.
  const scored: ScoredCandidate[] = [];
  for (const candidate of candidates) {
    const result = simulateFacility({
      services: candidate.services,
      horizonMinutes,
    });
    const score = estimateMinutesReturned(baseline, result);
    if (score <= 0) continue;
    scored.push({ ...candidate, score, result });
  }

  if (scored.length === 0) return null;

  scored.sort((a, b) => b.score - a.score || a.priority - b.priority);
  const best = scored[0];
  if (best === undefined) return null;
  const secondBest = scored[1]?.score ?? 0;

  const baselineService = serviceResult(baseline, target.serviceId);
  const optimizedService = serviceResult(best.result, target.serviceId);

  return {
    serviceId: target.serviceId,
    actionType: best.actionType,
    actionPayload: best.payload,
    baselineWaitMinutes: baselineService?.finalWaitMinutes ?? 0,
    optimizedWaitMinutes: optimizedService?.finalWaitMinutes ?? 0,
    baselinePersonMinutes: baseline.totalPersonMinutesWaiting,
    optimizedPersonMinutes: best.result.totalPersonMinutesWaiting,
    estimatedMinutesReturned: best.score,
    confidence: confidenceFromMargin(best.score, secondBest),
  };
}
