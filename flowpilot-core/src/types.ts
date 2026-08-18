/**
 * FlowPilot — canonical domain contracts.
 * FROZEN. No surface may redefine these names or string values.
 * Changes require coordinated approval across Android / web / backend.
 */

export type TokenStatus =
  | "waiting"
  | "called"
  | "serving"
  | "completed"
  | "cancelled"
  | "skipped";

export type CounterStatus = "active" | "inactive";

export type QueueHealth = "healthy" | "busy" | "critical";

export type InterventionStatus =
  | "recommended"
  | "approved"
  | "pending_staff"
  | "accepted"
  | "applied"
  | "rejected"
  | "completed";

export type AssignmentType = "primary" | "temporary";

/**
 * Lifecycle of a (staff, counter, service) Assignment. Mirrors the
 * `counter_assignments.status` CHECK constraint. Only `active` Assignments
 * contribute capacity — see docs/adr/0001-assignment-is-the-movable-unit.md.
 */
export type AssignmentStatus = "active" | "ended";

/**
 * The two — and only two — things FlowPilot can do to capacity.
 *
 * The movable unit is an *assignment*: a (staff, counter, service) binding.
 * A counter is a physical desk and does not move. A staff member moves
 * between services, gated by staff_skills.
 *
 *  activate_counter — bind an idle staff member to an INACTIVE counter.
 *  reassign_staff   — rebind an ACTIVE staff member to a different service.
 */
export type ActionType = "activate_counter" | "reassign_staff";

export interface QueueSnapshot {
  serviceId: string;
  queueLength: number;
  activeCounters: number;
  averageServiceMinutes: number;
  predictedWaitMinutes: number;
  etaLowerMinutes: number;
  etaUpperMinutes: number;
  health: QueueHealth;
  arrivalRatePerMinute?: number;
}

export interface Recommendation {
  id?: string;
  serviceId: string;
  actionType: ActionType;
  actionPayload: ActivateCounterPayload | ReassignStaffPayload;
  baselineWaitMinutes: number;
  optimizedWaitMinutes: number;
  baselinePersonMinutes: number;
  optimizedPersonMinutes: number;
  /** ESTIMATED, not measured. Counterfactual from the simulator. */
  estimatedMinutesReturned: number;
  confidence?: "low" | "medium" | "high";
}

export interface ActivateCounterPayload {
  counterId: string;
  staffId: string;
  serviceId: string;
  durationMinutes: number;
}

export interface ReassignStaffPayload {
  staffId: string;
  counterId: string;
  fromServiceId: string;
  toServiceId: string;
  durationMinutes: number;
}

export interface FacilityServiceState {
  serviceId: string;
  queueLength: number;
  activeCounters: number;
  averageServiceMinutes: number;
  arrivalRatePerMinute: number;
  downstreamArrivalRatePerMinute?: number;
}

export interface SimulationInput {
  services: FacilityServiceState[];
  horizonMinutes: number;
}

export interface ServiceSimulationResult {
  serviceId: string;
  queueLengthByMinute: number[];
  finalQueueLength: number;
  peakQueueLength: number;
  finalWaitMinutes: number;
  personMinutesWaiting: number;
  health: QueueHealth;
}

export interface SimulationResult {
  services: ServiceSimulationResult[];
  totalPersonMinutesWaiting: number;
  horizonMinutes: number;
}

/* ------------------------------------------------------------------ *
 * Recommendation engine inputs (additive; nothing above is changed).
 * ------------------------------------------------------------------ */

/** A (staff, service) capability row — mirrors `staff_skills`. */
export interface StaffSkill {
  staffId: string;
  serviceId: string;
  proficiency?: number;
}

export type StaffAvailability = "idle" | "active";

/** A staff member and, if active, where they are currently working. */
export interface StaffMemberState {
  staffId: string;
  availability: StaffAvailability;
  /** Service the staff member is currently serving (active only). */
  currentServiceId?: string;
  /** Counter the staff member currently occupies (active only). */
  currentCounterId?: string;
}

/**
 * A physical desk. Counters never move; only the (staff, counter, service)
 * assignment moves.
 */
export interface CounterState {
  counterId: string;
  status: CounterStatus;
  /** Service this counter is currently bound to, if any. */
  serviceId?: string;
  /** Services this counter may serve. Undefined means "any service". */
  eligibleServiceIds?: string[];
  /** Staff currently bound to this counter, if any. */
  staffId?: string;
}

export interface RecommendationInput {
  services: FacilityServiceState[];
  counters: CounterState[];
  staff: StaffMemberState[];
  staffSkills: StaffSkill[];
  /** Simulation horizon used for the counterfactual. Default 60. */
  horizonMinutes?: number;
  /** Temporary assignment duration written into the payload. Default 30. */
  durationMinutes?: number;
  /** Force a target service; otherwise the most pressured one is chosen. */
  pressuredServiceId?: string;
}
