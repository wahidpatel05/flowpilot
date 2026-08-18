/**
 * Simulation engine — deterministic per-minute fluid queue model. Spec §9.
 *
 *   arrivals    = arrivalRatePerMinute + (downstreamArrivalRatePerMinute ?? 0)
 *   capacity    = activeCounters / averageServiceMinutes
 *   queue[t+1]  = max(0, queue[t] + arrivals - capacity)
 *
 * No randomness, no I/O. Same input always yields the same output.
 */
import type {
  FacilityServiceState,
  ServiceSimulationResult,
  SimulationInput,
  SimulationResult,
} from "../types.js";
import { calculateQueueHealth } from "../queue/eta.js";

/** Service throughput in customers per minute. */
export function calculateCapacityPerMinute(
  service: Pick<FacilityServiceState, "activeCounters" | "averageServiceMinutes">,
): number {
  if (service.activeCounters <= 0) return 0;
  if (service.averageServiceMinutes <= 0) return Number.POSITIVE_INFINITY;
  return service.activeCounters / service.averageServiceMinutes;
}

/** Total customers entering per minute (direct + downstream). */
export function calculateArrivalsPerMinute(
  service: Pick<
    FacilityServiceState,
    "arrivalRatePerMinute" | "downstreamArrivalRatePerMinute"
  >,
): number {
  return (
    service.arrivalRatePerMinute + (service.downstreamArrivalRatePerMinute ?? 0)
  );
}

function simulateService(
  service: FacilityServiceState,
  horizonMinutes: number,
): ServiceSimulationResult {
  const horizon = Math.max(0, Math.floor(horizonMinutes));
  const arrivals = calculateArrivalsPerMinute(service);
  const capacity = calculateCapacityPerMinute(service);
  const netPerMinute = arrivals - capacity;

  const queueLengthByMinute = new Array<number>(horizon + 1);
  let queue = Math.max(0, service.queueLength);
  queueLengthByMinute[0] = queue;

  let peakQueueLength = queue;
  // Person-minutes = queue length present during each simulated minute,
  // measured at the start of that minute.
  let personMinutesWaiting = 0;

  for (let minute = 0; minute < horizon; minute += 1) {
    personMinutesWaiting += queue;
    queue = Math.max(0, queue + netPerMinute);
    queueLengthByMinute[minute + 1] = queue;
    if (queue > peakQueueLength) peakQueueLength = queue;
  }

  const finalWaitMinutes =
    capacity > 0 ? queue / capacity : queue > 0 ? Number.POSITIVE_INFINITY : 0;

  return {
    serviceId: service.serviceId,
    queueLengthByMinute,
    finalQueueLength: queue,
    peakQueueLength,
    finalWaitMinutes,
    personMinutesWaiting,
    health: calculateQueueHealth({ predictedWaitMinutes: finalWaitMinutes }),
  };
}

/** Runs the per-minute model across every service in the facility. */
export function simulateFacility(input: SimulationInput): SimulationResult {
  const horizonMinutes = Math.max(0, Math.floor(input.horizonMinutes));
  const services = new Array<ServiceSimulationResult>(input.services.length);
  let totalPersonMinutesWaiting = 0;

  for (let index = 0; index < input.services.length; index += 1) {
    const service = input.services[index];
    if (service === undefined) continue;
    const result = simulateService(service, horizonMinutes);
    services[index] = result;
    totalPersonMinutesWaiting += result.personMinutesWaiting;
  }

  return {
    services: services.filter(
      (result): result is ServiceSimulationResult => result !== undefined,
    ),
    totalPersonMinutesWaiting,
    horizonMinutes,
  };
}
