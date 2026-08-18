/**
 * Facility projection — the ONE place where Supabase rows become domain state.
 *
 * Every surface (Control, Desk, the Android app, the Visitor PWA) needs the same
 * answer to "what is the state of this facility right now?". If Control counts
 * active Counters differently from the phone, the dashboard and the Visitor
 * disagree about the same queue, and that bug is invisible until you are on
 * stage. So the derivation lives here, once, and every surface calls it.
 *
 * Pure and dependency-free: no Supabase import, no I/O, and no clock read unless
 * you decline to pass one. Row shapes are declared structurally from the columns
 * in `supabase/migrations/0001_init.sql`, so any client that can produce those
 * objects — postgrest-js, a Kotlin serializer, a fixture — can call this.
 *
 * The rules it encodes so that nobody re-derives them:
 *
 *   activeCounters   = distinct Counters holding an `active` counter_assignment
 *                      for the Service. NEVER counters.status. A Counter that is
 *                      physically `active` but holds no active Assignment
 *                      contributes ZERO capacity. (ADR-0001: the Assignment is
 *                      the movable unit.)
 *   queueLength      = Tokens with status `waiting` or `called`. `serving` is
 *                      already at a Counter; `completed` / `cancelled` /
 *                      `skipped` have left.
 *   averageService   = calculateAverageServiceMinutes() over recent completed
 *                      durations, with services.default_service_minutes as the
 *                      cold start.
 *   arrivalRate      = Tokens joined per minute over a trailing window.
 *   downstreamRate   = Flow Graph edges: the sum of expected_share x the
 *                      upstream Service's arrival rate, one hop.
 */
import type {
  AssignmentStatus,
  AssignmentType,
  CounterState,
  CounterStatus,
  FacilityServiceState,
  QueueHealth,
  QueueSnapshot,
  StaffAvailability,
  StaffMemberState,
  StaffSkill,
  TokenStatus,
} from "../types.js";
import {
  DEFAULT_CRITICAL_THRESHOLD_MINUTES,
  DEFAULT_HEALTHY_THRESHOLD_MINUTES,
  buildQueueSnapshot,
  calculateAverageServiceMinutes,
  calculateEta,
  calculateEtaRange,
  calculateQueueHealth,
} from "../queue/eta.js";

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

/** The only two Token statuses that are still waiting in line. */
export const QUEUEING_TOKEN_STATUSES: readonly TokenStatus[] = [
  "waiting",
  "called",
];

/** The only counter_assignments.status that contributes capacity. */
export const ACTIVE_ASSIGNMENT_STATUS: AssignmentStatus = "active";

/** Trailing window used to derive an arrival rate from `joined_at`. */
export const DEFAULT_ARRIVAL_WINDOW_MINUTES = 30;

/**
 * Mirrors `services.default_service_minutes`' own column default. Used only when
 * a row arrives with a missing or nonsensical value, so a bad row can never
 * produce NaN downstream.
 */
export const FALLBACK_DEFAULT_SERVICE_MINUTES = 5;

/* ------------------------------------------------------------------ *
 * Row shapes — structural mirrors of the Postgres columns.
 * ------------------------------------------------------------------ */

/** A `timestamptz` as PostgREST JSON, a millisecond epoch, or a Date. */
export type TimestampLike = string | number | Date;

/** `public.services` */
export interface ServiceRow {
  id: string;
  name?: string | null;
  slug?: string | null;
  default_service_minutes: number;
  healthy_wait_threshold?: number | null;
  critical_wait_threshold?: number | null;
}

/** `public.counters` — physical desks. This status is not capacity. */
export interface CounterRow {
  id: string;
  name?: string | null;
  status: CounterStatus;
}

/** `public.counter_assignments` — the movable (staff, counter, service) unit. */
export interface CounterAssignmentRow {
  id: string;
  counter_id: string;
  staff_id?: string | null;
  service_id: string;
  assignment_type?: AssignmentType | null;
  status: AssignmentStatus;
  started_at?: TimestampLike | null;
  ends_at?: TimestampLike | null;
}

/** `public.tokens` */
export interface TokenRow {
  id: string;
  service_id: string;
  token_number?: string | null;
  status: TokenStatus;
  priority?: number | null;
  joined_at: TimestampLike;
  called_at?: TimestampLike | null;
  service_started_at?: TimestampLike | null;
  completed_at?: TimestampLike | null;
  is_simulated?: boolean | null;
}

/** `public.staff` */
export interface StaffRow {
  id: string;
  name?: string | null;
  status: StaffAvailability;
}

/** `public.staff_skills` */
export interface StaffSkillRow {
  staff_id: string;
  service_id: string;
  proficiency?: number | null;
}

/** `public.service_flow_edges` — the Flow Graph. */
export interface ServiceFlowEdgeRow {
  from_service_id: string;
  to_service_id: string;
  expected_share: number;
  source?: string | null;
}

/**
 * Everything the projection reads. Optional sets default to empty, so a
 * narrowly-subscribed client can project only what it holds.
 */
export interface FacilityRows {
  services: readonly ServiceRow[];
  counters?: readonly CounterRow[];
  counterAssignments?: readonly CounterAssignmentRow[];
  tokens?: readonly TokenRow[];
  staff?: readonly StaffRow[];
  staffSkills?: readonly StaffSkillRow[];
  serviceFlowEdges?: readonly ServiceFlowEdgeRow[];
}

export interface ProjectFacilityOptions {
  /**
   * The instant being projected. Pass it for a deterministic projection;
   * omitted, the wall clock is read once.
   */
  now?: TimestampLike;
  /** Trailing window for the arrival rate. Default 30 minutes. */
  arrivalWindowMinutes?: number;
}

/* ------------------------------------------------------------------ *
 * Projected shapes
 * ------------------------------------------------------------------ */

/** One Token still in line, in call order. */
export interface ProjectedQueueEntry {
  tokenId: string;
  tokenNumber: string;
  status: TokenStatus;
  /**
   * TRUE for Tokens injected by Simulate Rush. They count toward queueLength
   * and must stay visibly labelled on every surface that renders them.
   */
  isSimulated: boolean;
  joinedAtMillis: number;
  priority: number;
  /** 0-based place in line. */
  position: number;
}

/**
 * The full derivation for one Service — everything the frozen contracts have no
 * field for, kept beside them rather than re-derived per surface.
 */
export interface ProjectedService {
  serviceId: string;
  serviceName?: string;
  slug?: string;
  /** `waiting` + `called`. */
  queueLength: number;
  /** The part of queueLength injected by Simulate Rush. */
  simulatedQueueLength: number;
  /** The part of queueLength from real Visitors. */
  realQueueLength: number;
  /** Distinct Counters holding an `active` Assignment for this Service. */
  activeCounters: number;
  /**
   * Raw count of `active` Assignments. Differs from activeCounters only when two
   * Assignments share one Counter, which capacity must not double-count.
   */
  activeAssignmentCount: number;
  activeCounterIds: string[];
  averageServiceMinutes: number;
  defaultServiceMinutes: number;
  /** How many completed durations fed the blend. Zero means cold start. */
  completedDurationSampleCount: number;
  /** TRUE when averageServiceMinutes is the Service default, unblended. */
  isColdStart: boolean;
  arrivalRatePerMinute: number;
  downstreamArrivalRatePerMinute: number;
  healthyThresholdMinutes: number;
  criticalThresholdMinutes: number;
  /** Tokens still in line, in call order. */
  queue: ProjectedQueueEntry[];
}

/**
 * The whole facility at one instant.
 *
 * `services`, `counters`, `staff` and `staffSkills` are named and shaped to
 * satisfy `RecommendationInput`, so the engine consumes the projection directly:
 *
 *   recommendIntervention({ ...projectFacility(rows), horizonMinutes: 60 })
 *   simulateFacility({ services: projection.services, horizonMinutes: 60 })
 */
export interface FacilityProjection {
  /** Millisecond epoch this projection represents. */
  observedAtMillis: number;
  services: FacilityServiceState[];
  queueSnapshots: QueueSnapshot[];
  counters: CounterState[];
  staff: StaffMemberState[];
  staffSkills: StaffSkill[];
  serviceDetails: ProjectedService[];
}

/** One Visitor's view of their own Token. */
export interface ProjectedTokenEta {
  tokenId: string;
  tokenNumber: string;
  serviceId: string;
  /** 0-based place in line. */
  position: number;
  /** People in front of this Visitor. */
  customersAhead: number;
  isSimulated: boolean;
  predictedWaitMinutes: number;
  etaLowerMinutes: number;
  etaUpperMinutes: number;
  health: QueueHealth;
}

/* ------------------------------------------------------------------ *
 * Coercion helpers — a malformed row must never yield NaN.
 * ------------------------------------------------------------------ */

function toMillis(value: TimestampLike | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) {
    const millis = value.getTime();
    return Number.isFinite(millis) ? millis : undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function toFiniteNumber(
  value: number | string | null | undefined,
  fallback: number,
): number {
  if (value === null || value === undefined) return fallback;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toPositiveNumber(
  value: number | string | null | undefined,
  fallback: number,
): number {
  const numeric = toFiniteNumber(value, fallback);
  return numeric > 0 ? numeric : fallback;
}

/* ------------------------------------------------------------------ *
 * Per-service accumulator
 * ------------------------------------------------------------------ */

interface DurationSample {
  completedAtMillis: number;
  minutes: number;
}

interface ServiceAccumulator {
  row: ServiceRow;
  queue: ProjectedQueueEntry[];
  simulatedQueueLength: number;
  /** Completed durations, oldest first — the engine keeps the newest 30. */
  durationSamples: DurationSample[];
  arrivalsInWindow: number;
  activeCounterIds: Set<string>;
  activeAssignmentCount: number;
}

/** Call order: priority first, then join time, then id for determinism. */
function byCallOrder(a: ProjectedQueueEntry, b: ProjectedQueueEntry): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  if (a.joinedAtMillis !== b.joinedAtMillis) {
    return a.joinedAtMillis - b.joinedAtMillis;
  }
  return a.tokenId < b.tokenId ? -1 : a.tokenId > b.tokenId ? 1 : 0;
}

/* ------------------------------------------------------------------ *
 * The projection
 * ------------------------------------------------------------------ */

/**
 * Turns raw row sets into the engine's input contracts. Deterministic for a
 * given `now`: the same rows in always produce the same domain state out.
 */
export function projectFacility(
  rows: FacilityRows,
  options: ProjectFacilityOptions = {},
): FacilityProjection {
  const observedAtMillis = toMillis(options.now) ?? Date.now();
  const arrivalWindowMinutes = toPositiveNumber(
    options.arrivalWindowMinutes,
    DEFAULT_ARRIVAL_WINDOW_MINUTES,
  );
  const arrivalCutoffMillis = observedAtMillis - arrivalWindowMinutes * 60_000;

  // ---- Index the Service catalogue. Rows pointing at an unknown Service are
  // ---- ignored rather than inventing a Service the catalogue does not list.
  const accumulators = new Map<string, ServiceAccumulator>();
  const orderedAccumulators: ServiceAccumulator[] = [];
  for (const row of rows.services) {
    if (accumulators.has(row.id)) continue;
    const accumulator: ServiceAccumulator = {
      row,
      queue: [],
      simulatedQueueLength: 0,
      durationSamples: [],
      arrivalsInWindow: 0,
      activeCounterIds: new Set<string>(),
      activeAssignmentCount: 0,
    };
    accumulators.set(row.id, accumulator);
    orderedAccumulators.push(accumulator);
  }

  // ---- Capacity: `active` Assignments ONLY (ADR-0001). counters.status is
  // ---- deliberately not consulted here — a physically active Counter with no
  // ---- active Assignment has nobody sitting at it.
  const assignmentByCounterId = new Map<
    string,
    { serviceId: string; staffId?: string }
  >();
  const assignmentByStaffId = new Map<
    string,
    { serviceId: string; counterId: string }
  >();

  for (const assignment of rows.counterAssignments ?? []) {
    if (assignment.status !== ACTIVE_ASSIGNMENT_STATUS) continue;
    const accumulator = accumulators.get(assignment.service_id);
    if (accumulator === undefined) continue;

    accumulator.activeAssignmentCount += 1;
    // Distinct Counters: two Assignments on one desk are still one desk.
    accumulator.activeCounterIds.add(assignment.counter_id);

    if (!assignmentByCounterId.has(assignment.counter_id)) {
      const entry: { serviceId: string; staffId?: string } = {
        serviceId: assignment.service_id,
      };
      if (assignment.staff_id !== null && assignment.staff_id !== undefined) {
        entry.staffId = assignment.staff_id;
      }
      assignmentByCounterId.set(assignment.counter_id, entry);
    }

    if (
      assignment.staff_id !== null &&
      assignment.staff_id !== undefined &&
      !assignmentByStaffId.has(assignment.staff_id)
    ) {
      assignmentByStaffId.set(assignment.staff_id, {
        serviceId: assignment.service_id,
        counterId: assignment.counter_id,
      });
    }
  }

  // ---- Demand: queue length, measured service durations, arrivals.
  for (const token of rows.tokens ?? []) {
    const accumulator = accumulators.get(token.service_id);
    if (accumulator === undefined) continue;

    const joinedAtMillis = toMillis(token.joined_at);
    if (joinedAtMillis !== undefined && joinedAtMillis >= arrivalCutoffMillis) {
      accumulator.arrivalsInWindow += 1;
    }

    if (QUEUEING_TOKEN_STATUSES.includes(token.status)) {
      const isSimulated = token.is_simulated === true;
      if (isSimulated) accumulator.simulatedQueueLength += 1;
      accumulator.queue.push({
        tokenId: token.id,
        tokenNumber: token.token_number ?? "",
        status: token.status,
        isSimulated,
        joinedAtMillis: joinedAtMillis ?? observedAtMillis,
        priority: Math.trunc(toFiniteNumber(token.priority, 0)),
        position: 0,
      });
      continue;
    }

    // service_started_at + completed_at is the ONLY measured duration source.
    if (token.status !== "completed") continue;
    const startedAtMillis = toMillis(token.service_started_at);
    const completedAtMillis = toMillis(token.completed_at);
    if (startedAtMillis === undefined || completedAtMillis === undefined) {
      continue;
    }
    const minutes = (completedAtMillis - startedAtMillis) / 60_000;
    if (!Number.isFinite(minutes) || minutes <= 0) continue;
    accumulator.durationSamples.push({ completedAtMillis, minutes });
  }

  // ---- First pass: everything that does not depend on another Service.
  interface Derived {
    accumulator: ServiceAccumulator;
    projected: ProjectedService;
  }
  const derived: Derived[] = [];

  for (const accumulator of orderedAccumulators) {
    const { row } = accumulator;

    accumulator.queue.sort(byCallOrder);
    for (let index = 0; index < accumulator.queue.length; index += 1) {
      const entry = accumulator.queue[index];
      if (entry !== undefined) entry.position = index;
    }

    const defaultServiceMinutes = toPositiveNumber(
      row.default_service_minutes,
      FALLBACK_DEFAULT_SERVICE_MINUTES,
    );

    accumulator.durationSamples.sort(
      (a, b) => a.completedAtMillis - b.completedAtMillis,
    );
    const recentDurationsMinutes = accumulator.durationSamples.map(
      (sample) => sample.minutes,
    );
    const averageServiceMinutes = calculateAverageServiceMinutes({
      recentDurationsMinutes,
      defaultMinutes: defaultServiceMinutes,
    });

    const queueLength = accumulator.queue.length;
    const projected: ProjectedService = {
      serviceId: row.id,
      queueLength,
      simulatedQueueLength: accumulator.simulatedQueueLength,
      realQueueLength: queueLength - accumulator.simulatedQueueLength,
      activeCounters: accumulator.activeCounterIds.size,
      activeAssignmentCount: accumulator.activeAssignmentCount,
      activeCounterIds: [...accumulator.activeCounterIds].sort(),
      averageServiceMinutes,
      defaultServiceMinutes,
      completedDurationSampleCount: recentDurationsMinutes.length,
      isColdStart: recentDurationsMinutes.length === 0,
      arrivalRatePerMinute: accumulator.arrivalsInWindow / arrivalWindowMinutes,
      downstreamArrivalRatePerMinute: 0,
      healthyThresholdMinutes: toFiniteNumber(
        row.healthy_wait_threshold,
        DEFAULT_HEALTHY_THRESHOLD_MINUTES,
      ),
      criticalThresholdMinutes: toFiniteNumber(
        row.critical_wait_threshold,
        DEFAULT_CRITICAL_THRESHOLD_MINUTES,
      ),
      queue: accumulator.queue,
    };
    if (row.name !== null && row.name !== undefined) {
      projected.serviceName = row.name;
    }
    if (row.slug !== null && row.slug !== undefined) {
      projected.slug = row.slug;
    }

    derived.push({ accumulator, projected });
  }

  // ---- Second pass: the Flow Graph. One hop — the share of each upstream
  // ---- Service's arrivals expected to turn up here next. This is what lets a
  // ---- Service see a queue forming upstream before it arrives.
  const projectedById = new Map<string, ProjectedService>();
  for (const entry of derived) {
    projectedById.set(entry.projected.serviceId, entry.projected);
  }

  for (const edge of rows.serviceFlowEdges ?? []) {
    const upstream = projectedById.get(edge.from_service_id);
    const downstream = projectedById.get(edge.to_service_id);
    if (upstream === undefined || downstream === undefined) continue;
    if (upstream === downstream) continue;
    const share = toFiniteNumber(edge.expected_share, 0);
    if (share <= 0) continue;
    downstream.downstreamArrivalRatePerMinute +=
      upstream.arrivalRatePerMinute * share;
  }

  // ---- Third pass: the frozen engine contracts.
  const services: FacilityServiceState[] = [];
  const queueSnapshots: QueueSnapshot[] = [];
  const serviceDetails: ProjectedService[] = [];

  for (const { accumulator, projected } of derived) {
    serviceDetails.push(projected);

    services.push({
      serviceId: projected.serviceId,
      queueLength: projected.queueLength,
      activeCounters: projected.activeCounters,
      averageServiceMinutes: projected.averageServiceMinutes,
      arrivalRatePerMinute: projected.arrivalRatePerMinute,
      downstreamArrivalRatePerMinute: projected.downstreamArrivalRatePerMinute,
      // Carried so a simulated Health band matches the live one for the same
      // wait. Without these, simulateFacility falls back to engine defaults.
      healthyThresholdMinutes: projected.healthyThresholdMinutes,
      criticalThresholdMinutes: projected.criticalThresholdMinutes,
    });

    queueSnapshots.push(
      buildQueueSnapshot({
        serviceId: projected.serviceId,
        queueLength: projected.queueLength,
        activeCounters: projected.activeCounters,
        recentDurationsMinutes: accumulator.durationSamples.map(
          (sample) => sample.minutes,
        ),
        defaultServiceMinutes: projected.defaultServiceMinutes,
        healthyThreshold: projected.healthyThresholdMinutes,
        criticalThreshold: projected.criticalThresholdMinutes,
        arrivalRatePerMinute: projected.arrivalRatePerMinute,
      }),
    );
  }

  // ---- Counters and Staff, for the recommendation engine. Here — and only
  // ---- here — counters.status matters: it is what makes a desk a candidate for
  // ---- activate_counter. Eligibility is left undefined ("any Service") because
  // ---- the schema holds no per-Counter Service restriction; Skill is the hard
  // ---- constraint (ADR-0001).
  const counters: CounterState[] = [];
  for (const row of rows.counters ?? []) {
    const state: CounterState = { counterId: row.id, status: row.status };
    const assignment = assignmentByCounterId.get(row.id);
    if (assignment !== undefined) {
      state.serviceId = assignment.serviceId;
      if (assignment.staffId !== undefined) state.staffId = assignment.staffId;
    }
    counters.push(state);
  }

  const staff: StaffMemberState[] = [];
  for (const row of rows.staff ?? []) {
    const state: StaffMemberState = {
      staffId: row.id,
      availability: row.status,
    };
    const assignment = assignmentByStaffId.get(row.id);
    if (assignment !== undefined) {
      state.currentServiceId = assignment.serviceId;
      state.currentCounterId = assignment.counterId;
    }
    staff.push(state);
  }

  const staffSkills: StaffSkill[] = [];
  for (const row of rows.staffSkills ?? []) {
    const skill: StaffSkill = {
      staffId: row.staff_id,
      serviceId: row.service_id,
    };
    if (row.proficiency !== null && row.proficiency !== undefined) {
      skill.proficiency = row.proficiency;
    }
    staffSkills.push(skill);
  }

  return {
    observedAtMillis,
    services,
    queueSnapshots,
    counters,
    staff,
    staffSkills,
    serviceDetails,
  };
}

/* ------------------------------------------------------------------ *
 * Lookups — so no surface hand-rolls a .find() over the wrong field.
 * ------------------------------------------------------------------ */

export function findProjectedService(
  projection: FacilityProjection,
  serviceId: string,
): ProjectedService | undefined {
  return projection.serviceDetails.find(
    (service) => service.serviceId === serviceId,
  );
}

export function findQueueSnapshot(
  projection: FacilityProjection,
  serviceId: string,
): QueueSnapshot | undefined {
  return projection.queueSnapshots.find(
    (snapshot) => snapshot.serviceId === serviceId,
  );
}

/**
 * One Visitor's own ETA: the people ahead of them, run through the same
 * `calculateEta` every other surface uses. Returns null when the Token is in no
 * queue — it is being served, has left, or belongs to another facility.
 */
export function projectTokenEta(
  projection: FacilityProjection,
  tokenId: string,
): ProjectedTokenEta | null {
  for (const service of projection.serviceDetails) {
    const entry = service.queue.find((token) => token.tokenId === tokenId);
    if (entry === undefined) continue;

    const customersAhead = entry.position;
    const predictedWaitMinutes = calculateEta({
      customersAhead,
      averageServiceMinutes: service.averageServiceMinutes,
      activeCounters: service.activeCounters,
    });
    const range = calculateEtaRange(predictedWaitMinutes);

    return {
      tokenId: entry.tokenId,
      tokenNumber: entry.tokenNumber,
      serviceId: service.serviceId,
      position: entry.position,
      customersAhead,
      isSimulated: entry.isSimulated,
      predictedWaitMinutes,
      etaLowerMinutes: range.lowerMinutes,
      etaUpperMinutes: range.upperMinutes,
      health: calculateQueueHealth({
        predictedWaitMinutes,
        healthyThreshold: service.healthyThresholdMinutes,
        criticalThreshold: service.criticalThresholdMinutes,
      }),
    };
  }
  return null;
}
