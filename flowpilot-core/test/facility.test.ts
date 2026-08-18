import { describe, expect, it } from "vitest";
import {
  DEFAULT_ARRIVAL_WINDOW_MINUTES,
  findProjectedService,
  findQueueSnapshot,
  projectFacility,
  projectTokenEta,
} from "../src/projection/facility.js";
import type {
  CounterAssignmentRow,
  CounterRow,
  FacilityRows,
  ServiceFlowEdgeRow,
  ServiceRow,
  StaffRow,
  StaffSkillRow,
  TokenRow,
} from "../src/projection/facility.js";
import { simulateFacility } from "../src/simulation/simulate.js";
import { recommendIntervention } from "../src/recommendation/recommend.js";
import type { ActivateCounterPayload } from "../src/types.js";

/* ------------------------------------------------------------------ *
 * Fixtures — the seeded facility from supabase/seed.sql, as rows.
 * Every timestamp is relative to a frozen NOW, so the suite is
 * deterministic and never reads a clock.
 * ------------------------------------------------------------------ */

const NOW = Date.parse("2026-08-18T10:00:00.000Z");

/** ISO timestamp for `minutesAgo` before the frozen NOW. */
function ago(minutesAgo: number): string {
  return new Date(NOW - minutesAgo * 60_000).toISOString();
}

const DOCUMENTS = "svc-documents";
const FEES = "svc-fees";
const EXAMINATION = "svc-examination";

const services: ServiceRow[] = [
  {
    id: DOCUMENTS,
    name: "Document Verification",
    slug: "documents",
    default_service_minutes: 4,
    healthy_wait_threshold: 15,
    critical_wait_threshold: 30,
  },
  {
    id: FEES,
    name: "Fees",
    slug: "fees",
    default_service_minutes: 3,
    healthy_wait_threshold: 12,
    critical_wait_threshold: 25,
  },
  {
    id: EXAMINATION,
    name: "Examination Cell",
    slug: "examination",
    default_service_minutes: 6,
    healthy_wait_threshold: 15,
    critical_wait_threshold: 30,
  },
];

/** Counter 1/2/3 physically active, Counter 4/5 spare. */
const counters: CounterRow[] = [
  { id: "counter-1", name: "Counter 1", status: "active" },
  { id: "counter-2", name: "Counter 2", status: "active" },
  { id: "counter-3", name: "Counter 3", status: "active" },
  { id: "counter-4", name: "Counter 4", status: "inactive" },
  { id: "counter-5", name: "Counter 5", status: "inactive" },
];

/**
 * Three active primary Assignments, plus one ENDED Assignment on Counter 5 for
 * Examination Cell: it must never be counted as capacity.
 */
const counterAssignments: CounterAssignmentRow[] = [
  {
    id: "asg-1",
    counter_id: "counter-1",
    staff_id: "staff-c",
    service_id: DOCUMENTS,
    assignment_type: "primary",
    status: "active",
    started_at: ago(300),
    ends_at: null,
  },
  {
    id: "asg-2",
    counter_id: "counter-2",
    staff_id: "staff-a",
    service_id: EXAMINATION,
    assignment_type: "primary",
    status: "active",
    started_at: ago(300),
    ends_at: null,
  },
  {
    id: "asg-3",
    counter_id: "counter-3",
    staff_id: "staff-b",
    service_id: FEES,
    assignment_type: "primary",
    status: "active",
    started_at: ago(300),
    ends_at: null,
  },
  {
    id: "asg-ended",
    counter_id: "counter-5",
    staff_id: "staff-d",
    service_id: EXAMINATION,
    assignment_type: "temporary",
    status: "ended",
    started_at: ago(120),
    ends_at: ago(60),
  },
];

const staff: StaffRow[] = [
  { id: "staff-a", name: "Priya Deshmukh", status: "active" },
  { id: "staff-b", name: "Rahul Iyer", status: "active" },
  { id: "staff-c", name: "Ayesha Khan", status: "active" },
  { id: "staff-d", name: "Vikram Rao", status: "idle" },
];

const staffSkills: StaffSkillRow[] = [
  { staff_id: "staff-a", service_id: DOCUMENTS, proficiency: 0.9 },
  { staff_id: "staff-a", service_id: EXAMINATION, proficiency: 0.8 },
  { staff_id: "staff-b", service_id: FEES, proficiency: 0.95 },
  { staff_id: "staff-c", service_id: DOCUMENTS, proficiency: 0.85 },
  { staff_id: "staff-c", service_id: FEES, proficiency: 0.7 },
  { staff_id: "staff-d", service_id: EXAMINATION, proficiency: 0.75 },
];

/** documents -> examination 0.6, examination -> fees 0.7, documents -> fees 0.3 */
const serviceFlowEdges: ServiceFlowEdgeRow[] = [
  { from_service_id: DOCUMENTS, to_service_id: EXAMINATION, expected_share: 0.6 },
  { from_service_id: EXAMINATION, to_service_id: FEES, expected_share: 0.7 },
  { from_service_id: DOCUMENTS, to_service_id: FEES, expected_share: 0.3 },
];

interface TokenOverrides {
  id: string;
  service_id: string;
  status: TokenRow["status"];
  minutesAgo: number;
  token_number?: string;
  is_simulated?: boolean;
  /** Measured span, only meaningful for a completed Token. */
  serviceMinutes?: number;
  priority?: number;
}

function token(overrides: TokenOverrides): TokenRow {
  const {
    id,
    service_id,
    status,
    minutesAgo,
    token_number = id.toUpperCase(),
    is_simulated = false,
    serviceMinutes,
    priority = 0,
  } = overrides;

  const row: TokenRow = {
    id,
    service_id,
    token_number,
    status,
    priority,
    joined_at: ago(minutesAgo),
    is_simulated,
  };

  if (status === "called" || status === "serving" || status === "completed") {
    row.called_at = ago(minutesAgo - 1);
  }
  if (status === "serving" || status === "completed") {
    row.service_started_at = ago(minutesAgo - 2);
  }
  if (status === "completed" && serviceMinutes !== undefined) {
    row.completed_at = ago(minutesAgo - 2 - serviceMinutes);
  }
  return row;
}

/**
 * Examination Cell: 6 waiting, 1 serving, 3 completed (6/8/10 measured minutes).
 * Document Verification: 2 waiting, 1 called, 1 serving, 1 cancelled, 1 skipped,
 * and NO completed history — it is the cold-start Service.
 * Fees: 1 waiting, 1 serving, 2 completed.
 */
const tokens: TokenRow[] = [
  // --- Examination Cell
  token({ id: "e-1", service_id: EXAMINATION, status: "waiting", minutesAgo: 18 }),
  token({ id: "e-2", service_id: EXAMINATION, status: "waiting", minutesAgo: 15 }),
  token({ id: "e-3", service_id: EXAMINATION, status: "waiting", minutesAgo: 12 }),
  token({ id: "e-4", service_id: EXAMINATION, status: "waiting", minutesAgo: 9 }),
  token({ id: "e-5", service_id: EXAMINATION, status: "waiting", minutesAgo: 6 }),
  token({ id: "e-6", service_id: EXAMINATION, status: "waiting", minutesAgo: 3 }),
  token({ id: "e-serving", service_id: EXAMINATION, status: "serving", minutesAgo: 9 }),
  token({
    id: "e-done-1",
    service_id: EXAMINATION,
    status: "completed",
    minutesAgo: 120,
    serviceMinutes: 6,
  }),
  token({
    id: "e-done-2",
    service_id: EXAMINATION,
    status: "completed",
    minutesAgo: 100,
    serviceMinutes: 8,
  }),
  token({
    id: "e-done-3",
    service_id: EXAMINATION,
    status: "completed",
    minutesAgo: 80,
    serviceMinutes: 10,
  }),
  // --- Document Verification (cold start: no completed history)
  token({ id: "d-called", service_id: DOCUMENTS, status: "called", minutesAgo: 25 }),
  token({ id: "d-1", service_id: DOCUMENTS, status: "waiting", minutesAgo: 20 }),
  token({ id: "d-2", service_id: DOCUMENTS, status: "waiting", minutesAgo: 10 }),
  token({ id: "d-serving", service_id: DOCUMENTS, status: "serving", minutesAgo: 9 }),
  token({ id: "d-cancelled", service_id: DOCUMENTS, status: "cancelled", minutesAgo: 40 }),
  token({ id: "d-skipped", service_id: DOCUMENTS, status: "skipped", minutesAgo: 35 }),
  // --- Fees
  token({ id: "f-1", service_id: FEES, status: "waiting", minutesAgo: 5 }),
  token({ id: "f-serving", service_id: FEES, status: "serving", minutesAgo: 9 }),
  token({
    id: "f-done-1",
    service_id: FEES,
    status: "completed",
    minutesAgo: 90,
    serviceMinutes: 3,
  }),
  token({
    id: "f-done-2",
    service_id: FEES,
    status: "completed",
    minutesAgo: 70,
    serviceMinutes: 3,
  }),
];

function baseRows(overrides: Partial<FacilityRows> = {}): FacilityRows {
  return {
    services,
    counters,
    counterAssignments,
    tokens,
    staff,
    staffSkills,
    serviceFlowEdges,
    ...overrides,
  };
}

function project(overrides: Partial<FacilityRows> = {}) {
  return projectFacility(baseRows(overrides), { now: NOW });
}

/** Non-null accessor so a missing Service fails loudly instead of silently. */
function serviceDetail(
  projection: ReturnType<typeof project>,
  serviceId: string,
) {
  const detail = findProjectedService(projection, serviceId);
  expect(detail).toBeDefined();
  if (detail === undefined) throw new Error("unreachable");
  return detail;
}

function snapshot(
  projection: ReturnType<typeof project>,
  serviceId: string,
) {
  const found = findQueueSnapshot(projection, serviceId);
  expect(found).toBeDefined();
  if (found === undefined) throw new Error("unreachable");
  return found;
}

/* ------------------------------------------------------------------ *
 * Capacity — ADR-0001
 * ------------------------------------------------------------------ */

describe("projectFacility — active Counters come from Assignments", () => {
  it("counts the distinct Counters holding an active Assignment", () => {
    const projection = project();
    expect(serviceDetail(projection, DOCUMENTS).activeCounters).toBe(1);
    expect(serviceDetail(projection, FEES).activeCounters).toBe(1);
    expect(serviceDetail(projection, EXAMINATION).activeCounters).toBe(1);
    expect(serviceDetail(projection, EXAMINATION).activeCounterIds).toEqual([
      "counter-2",
    ]);
  });

  it("excludes ended Assignments", () => {
    // asg-ended binds Counter 5 to Examination Cell but is status 'ended'.
    const projection = project();
    const examination = serviceDetail(projection, EXAMINATION);
    expect(examination.activeCounterIds).not.toContain("counter-5");
    expect(examination.activeAssignmentCount).toBe(1);

    // Reviving exactly that row is the only difference, and capacity doubles.
    const revived = project({
      counterAssignments: counterAssignments.map((assignment) =>
        assignment.id === "asg-ended"
          ? { ...assignment, status: "active" as const }
          : assignment,
      ),
    });
    expect(serviceDetail(revived, EXAMINATION).activeCounters).toBe(2);
  });

  it("reports zero active Counters when a physically active Counter holds no Assignment", () => {
    // Counter 1/2/3 stay status 'active'; every Assignment is ended.
    const projection = project({
      counterAssignments: counterAssignments.map((assignment) => ({
        ...assignment,
        status: "ended" as const,
      })),
    });

    for (const service of projection.serviceDetails) {
      expect(service.activeCounters).toBe(0);
      expect(service.activeAssignmentCount).toBe(0);
      expect(service.activeCounterIds).toEqual([]);
    }
    // The Counters themselves are still physically active — proving the count
    // never reads counters.status.
    expect(projection.counters.filter((c) => c.status === "active")).toHaveLength(3);
  });

  it("counts an active Assignment even on a Counter marked inactive", () => {
    // The Assignment is the unit that carries capacity, not the desk's flag.
    const projection = project({
      counters: counters.map((counter) =>
        counter.id === "counter-2"
          ? { ...counter, status: "inactive" as const }
          : counter,
      ),
    });
    expect(serviceDetail(projection, EXAMINATION).activeCounters).toBe(1);
  });

  it("never double counts two active Assignments on one Counter", () => {
    const projection = project({
      counterAssignments: [
        ...counterAssignments,
        {
          id: "asg-dupe",
          counter_id: "counter-2",
          staff_id: "staff-d",
          service_id: EXAMINATION,
          assignment_type: "temporary",
          status: "active",
          started_at: ago(5),
          ends_at: ago(-25),
        },
      ],
    });
    const examination = serviceDetail(projection, EXAMINATION);
    expect(examination.activeAssignmentCount).toBe(2);
    expect(examination.activeCounters).toBe(1);
  });

  it("ignores Assignments for a Service outside the catalogue", () => {
    const projection = project({
      counterAssignments: [
        ...counterAssignments,
        {
          id: "asg-ghost",
          counter_id: "counter-4",
          staff_id: "staff-d",
          service_id: "svc-does-not-exist",
          assignment_type: "primary",
          status: "active",
        },
      ],
    });
    expect(projection.serviceDetails).toHaveLength(3);
    const total = projection.serviceDetails.reduce(
      (sum, service) => sum + service.activeCounters,
      0,
    );
    expect(total).toBe(3);
  });
});

/* ------------------------------------------------------------------ *
 * Queue length
 * ------------------------------------------------------------------ */

describe("projectFacility — queue length", () => {
  it("counts waiting and called only", () => {
    const projection = project();
    // Documents holds 2 waiting + 1 called + 1 serving + 1 cancelled + 1 skipped.
    const documents = serviceDetail(projection, DOCUMENTS);
    expect(documents.queueLength).toBe(3);
    expect(documents.queue.map((entry) => entry.tokenId)).toEqual([
      "d-called",
      "d-1",
      "d-2",
    ]);
    expect(documents.queue.map((entry) => entry.status)).toEqual([
      "called",
      "waiting",
      "waiting",
    ]);
  });

  it("excludes serving, completed, cancelled and skipped Tokens", () => {
    const projection = project();
    const queuedIds = projection.serviceDetails.flatMap((service) =>
      service.queue.map((entry) => entry.tokenId),
    );
    for (const excluded of [
      "d-serving",
      "d-cancelled",
      "d-skipped",
      "e-serving",
      "e-done-1",
      "f-serving",
      "f-done-1",
    ]) {
      expect(queuedIds).not.toContain(excluded);
    }
    expect(serviceDetail(projection, EXAMINATION).queueLength).toBe(6);
    expect(serviceDetail(projection, FEES).queueLength).toBe(1);
  });

  it("orders the queue by priority, then join time, then id", () => {
    const projection = project({
      tokens: [
        token({ id: "q-late", service_id: FEES, status: "waiting", minutesAgo: 1 }),
        token({ id: "q-early", service_id: FEES, status: "waiting", minutesAgo: 20 }),
        token({
          id: "q-urgent",
          service_id: FEES,
          status: "waiting",
          minutesAgo: 1,
          priority: 5,
        }),
      ],
    });
    const fees = serviceDetail(projection, FEES);
    expect(fees.queue.map((entry) => entry.tokenId)).toEqual([
      "q-urgent",
      "q-early",
      "q-late",
    ]);
    expect(fees.queue.map((entry) => entry.position)).toEqual([0, 1, 2]);
  });

  it("ignores Tokens for a Service outside the catalogue", () => {
    const projection = project({
      tokens: [
        ...tokens,
        token({ id: "ghost", service_id: "svc-nope", status: "waiting", minutesAgo: 2 }),
      ],
    });
    const total = projection.serviceDetails.reduce(
      (sum, service) => sum + service.queueLength,
      0,
    );
    expect(total).toBe(3 + 1 + 6);
  });
});

/* ------------------------------------------------------------------ *
 * Average service minutes — cold start vs blend
 * ------------------------------------------------------------------ */

describe("projectFacility — average service minutes", () => {
  it("cold starts on the Service default when no completed durations exist", () => {
    const projection = project();
    const documents = serviceDetail(projection, DOCUMENTS);
    expect(documents.completedDurationSampleCount).toBe(0);
    expect(documents.isColdStart).toBe(true);
    expect(documents.averageServiceMinutes).toBe(4);
    expect(documents.defaultServiceMinutes).toBe(4);
  });

  it("blends the measured durations once completed Tokens exist", () => {
    // Examination Cell measured 6, 8 and 10 minutes -> mean 8.
    // 8 * 0.75 + 6 * 0.25 = 7.5
    const projection = project();
    const examination = serviceDetail(projection, EXAMINATION);
    expect(examination.completedDurationSampleCount).toBe(3);
    expect(examination.isColdStart).toBe(false);
    expect(examination.averageServiceMinutes).toBeCloseTo(7.5, 10);
    expect(snapshot(projection, EXAMINATION).averageServiceMinutes).toBeCloseTo(
      7.5,
      10,
    );
  });

  it("measures the span from service_started_at to completed_at, not from joined_at", () => {
    const projection = project({
      tokens: [
        {
          id: "long-wait",
          service_id: FEES,
          token_number: "F-900",
          status: "completed",
          // Waited two hours; was served in exactly 5 minutes.
          joined_at: ago(125),
          called_at: ago(6),
          service_started_at: ago(5),
          completed_at: ago(0),
          is_simulated: false,
        },
      ],
    });
    // 5 * 0.75 + 3 * 0.25 = 4.5
    expect(serviceDetail(projection, FEES).averageServiceMinutes).toBeCloseTo(
      4.5,
      10,
    );
  });

  it("stays on the cold start when completed rows carry no measured span", () => {
    const projection = project({
      tokens: [
        {
          id: "no-span",
          service_id: FEES,
          token_number: "F-901",
          status: "completed",
          joined_at: ago(50),
          called_at: ago(49),
          service_started_at: null,
          completed_at: null,
          is_simulated: false,
        },
      ],
    });
    const fees = serviceDetail(projection, FEES);
    expect(fees.completedDurationSampleCount).toBe(0);
    expect(fees.isColdStart).toBe(true);
    expect(fees.averageServiceMinutes).toBe(3);
  });

  it("keeps only the 30 most recent measured durations", () => {
    // 40 old 60-minute outliers, then 30 recent 4-minute spans.
    const outliers = Array.from({ length: 40 }, (_, index) =>
      token({
        id: `old-${index}`,
        service_id: FEES,
        status: "completed",
        minutesAgo: 600 - index,
        serviceMinutes: 60,
      }),
    );
    const recent = Array.from({ length: 30 }, (_, index) =>
      token({
        id: `recent-${index}`,
        service_id: FEES,
        status: "completed",
        minutesAgo: 120 - index,
        serviceMinutes: 4,
      }),
    );
    const projection = project({ tokens: [...outliers, ...recent] });
    // 4 * 0.75 + 3 * 0.25 = 3.75 — the 60s are outside the sample window.
    expect(serviceDetail(projection, FEES).averageServiceMinutes).toBeCloseTo(
      3.75,
      10,
    );
  });

  it("falls back to a safe default when default_service_minutes is unusable", () => {
    const projection = projectFacility(
      {
        services: [
          {
            id: "svc-broken",
            slug: "broken",
            default_service_minutes: Number.NaN,
          },
        ],
        tokens: [
          token({ id: "b-1", service_id: "svc-broken", status: "waiting", minutesAgo: 2 }),
        ],
        counterAssignments: [
          {
            id: "asg-b",
            counter_id: "counter-1",
            staff_id: "staff-a",
            service_id: "svc-broken",
            status: "active",
          },
        ],
      },
      { now: NOW },
    );
    const broken = serviceDetail(projection, "svc-broken");
    expect(broken.averageServiceMinutes).toBe(5);
    expect(Number.isNaN(broken.averageServiceMinutes)).toBe(false);
    expect(snapshot(projection, "svc-broken").predictedWaitMinutes).toBe(5);
  });
});

/* ------------------------------------------------------------------ *
 * ETA, Health, and the zero-capacity case
 * ------------------------------------------------------------------ */

describe("projectFacility — Queue Snapshots", () => {
  it("derives the predicted wait and Health from the Service's own thresholds", () => {
    const projection = project();
    // Examination Cell: 6 waiting x 7.5 min / 1 counter = 45 min, critical >= 30.
    const examination = snapshot(projection, EXAMINATION);
    expect(examination.queueLength).toBe(6);
    expect(examination.activeCounters).toBe(1);
    expect(examination.predictedWaitMinutes).toBeCloseTo(45, 10);
    expect(examination.health).toBe("critical");
    expect(examination.etaLowerMinutes).toBeCloseTo(45 * 0.85, 10);
    expect(examination.etaUpperMinutes).toBeCloseTo(45 * 1.15, 10);

    // Document Verification: 3 queued x 4 min / 1 counter = 12 min, healthy <= 15.
    const documents = snapshot(projection, DOCUMENTS);
    expect(documents.predictedWaitMinutes).toBeCloseTo(12, 10);
    expect(documents.health).toBe("healthy");

    // Fees: 1 queued x 3 min / 1 counter = 3 min.
    expect(snapshot(projection, FEES).predictedWaitMinutes).toBeCloseTo(3, 10);
    expect(snapshot(projection, FEES).health).toBe("healthy");
  });

  it("yields an infinite ETA and critical Health with zero active Counters — never NaN, never a throw", () => {
    const projection = project({
      counterAssignments: counterAssignments.map((assignment) => ({
        ...assignment,
        status: "ended" as const,
      })),
    });

    for (const queueSnapshot of projection.queueSnapshots) {
      expect(queueSnapshot.activeCounters).toBe(0);
      expect(queueSnapshot.predictedWaitMinutes).toBe(Number.POSITIVE_INFINITY);
      expect(queueSnapshot.etaLowerMinutes).toBe(Number.POSITIVE_INFINITY);
      expect(queueSnapshot.etaUpperMinutes).toBe(Number.POSITIVE_INFINITY);
      expect(queueSnapshot.health).toBe("critical");
      expect(Number.isNaN(queueSnapshot.predictedWaitMinutes)).toBe(false);
      expect(Number.isFinite(queueSnapshot.averageServiceMinutes)).toBe(true);
      expect(Number.isFinite(queueSnapshot.queueLength)).toBe(true);
    }
  });

  it("keeps an empty queue at zero minutes even with zero active Counters", () => {
    const projection = projectFacility(
      { services: [services[2] as ServiceRow], counterAssignments: [], tokens: [] },
      { now: NOW },
    );
    const examination = snapshot(projection, EXAMINATION);
    expect(examination.queueLength).toBe(0);
    expect(examination.activeCounters).toBe(0);
    // No counter open is still an unbounded wait for anyone who joins.
    expect(examination.predictedWaitMinutes).toBe(Number.POSITIVE_INFINITY);
    expect(examination.health).toBe("critical");
  });
});

/* ------------------------------------------------------------------ *
 * Simulated Tokens
 * ------------------------------------------------------------------ */

describe("projectFacility — simulated Tokens", () => {
  it("counts them in queue length but keeps them identifiable", () => {
    const rush = Array.from({ length: 12 }, (_, index) =>
      token({
        id: `rush-${index}`,
        service_id: EXAMINATION,
        status: "waiting",
        minutesAgo: 1,
        is_simulated: true,
      }),
    );
    const projection = project({ tokens: [...tokens, ...rush] });
    const examination = serviceDetail(projection, EXAMINATION);

    expect(examination.queueLength).toBe(18);
    expect(examination.simulatedQueueLength).toBe(12);
    expect(examination.realQueueLength).toBe(6);
    expect(snapshot(projection, EXAMINATION).queueLength).toBe(18);

    const simulated = examination.queue.filter((entry) => entry.isSimulated);
    expect(simulated).toHaveLength(12);
    expect(simulated.map((entry) => entry.tokenId)).toContain("rush-0");
    // Real Visitors joined earlier, so they keep the front of the line.
    expect(examination.queue.slice(0, 6).every((entry) => !entry.isSimulated)).toBe(
      true,
    );
  });

  it("treats a missing is_simulated flag as a real Visitor", () => {
    const projection = projectFacility(
      {
        services: [services[1] as ServiceRow],
        tokens: [
          {
            id: "no-flag",
            service_id: FEES,
            token_number: "F-950",
            status: "waiting",
            joined_at: ago(3),
          },
        ],
      },
      { now: NOW },
    );
    const fees = serviceDetail(projection, FEES);
    expect(fees.queueLength).toBe(1);
    expect(fees.simulatedQueueLength).toBe(0);
    expect(fees.queue[0]?.isSimulated).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Arrival rates and the Flow Graph
 * ------------------------------------------------------------------ */

describe("projectFacility — arrival rates and the Flow Graph", () => {
  it("derives the arrival rate from Tokens joined inside the trailing window", () => {
    const projection = project();
    // Documents: d-called (25), d-1 (20), d-2 (10), d-serving (9) are inside the
    // 30-minute window; d-cancelled (40) and d-skipped (35) are outside it.
    expect(serviceDetail(projection, DOCUMENTS).arrivalRatePerMinute).toBeCloseTo(
      4 / DEFAULT_ARRIVAL_WINDOW_MINUTES,
      10,
    );
    // Examination: 6 waiting + 1 serving inside; the 3 completed are hours old.
    expect(
      serviceDetail(projection, EXAMINATION).arrivalRatePerMinute,
    ).toBeCloseTo(7 / DEFAULT_ARRIVAL_WINDOW_MINUTES, 10);
    expect(serviceDetail(projection, FEES).arrivalRatePerMinute).toBeCloseTo(
      2 / DEFAULT_ARRIVAL_WINDOW_MINUTES,
      10,
    );
  });

  it("honours a custom arrival window", () => {
    const projection = projectFacility(baseRows(), {
      now: NOW,
      arrivalWindowMinutes: 10,
    });
    // Only d-2 (10 min) and d-serving (9 min) fall inside a 10-minute window.
    expect(serviceDetail(projection, DOCUMENTS).arrivalRatePerMinute).toBeCloseTo(
      2 / 10,
      10,
    );
  });

  it("derives downstream arrival rates from Flow Graph edges", () => {
    const projection = project();
    const documents = serviceDetail(projection, DOCUMENTS);
    const fees = serviceDetail(projection, FEES);
    const examination = serviceDetail(projection, EXAMINATION);

    // documents -> examination at 0.6
    expect(examination.downstreamArrivalRatePerMinute).toBeCloseTo(
      documents.arrivalRatePerMinute * 0.6,
      10,
    );
    // examination -> fees at 0.7 plus documents -> fees at 0.3
    expect(fees.downstreamArrivalRatePerMinute).toBeCloseTo(
      examination.arrivalRatePerMinute * 0.7 + documents.arrivalRatePerMinute * 0.3,
      10,
    );
    // Nothing flows into Document Verification.
    expect(documents.downstreamArrivalRatePerMinute).toBe(0);

    // And the engine contract carries the same numbers.
    const engineExamination = projection.services.find(
      (service) => service.serviceId === EXAMINATION,
    );
    expect(engineExamination?.downstreamArrivalRatePerMinute).toBeCloseTo(
      documents.arrivalRatePerMinute * 0.6,
      10,
    );
  });

  it("is zero everywhere when the Flow Graph is absent", () => {
    const projection = project({ serviceFlowEdges: [] });
    for (const service of projection.serviceDetails) {
      expect(service.downstreamArrivalRatePerMinute).toBe(0);
    }
  });

  it("ignores edges pointing outside the catalogue", () => {
    const projection = project({
      serviceFlowEdges: [
        ...serviceFlowEdges,
        { from_service_id: DOCUMENTS, to_service_id: "svc-nope", expected_share: 1 },
        { from_service_id: "svc-nope", to_service_id: EXAMINATION, expected_share: 1 },
      ],
    });
    const documents = serviceDetail(projection, DOCUMENTS);
    expect(
      serviceDetail(projection, EXAMINATION).downstreamArrivalRatePerMinute,
    ).toBeCloseTo(documents.arrivalRatePerMinute * 0.6, 10);
  });
});

/* ------------------------------------------------------------------ *
 * Counters, Staff and Skills — the recommendation engine's inputs
 * ------------------------------------------------------------------ */

describe("projectFacility — Counters, Staff and Skills", () => {
  it("binds each Counter to the Service and Staff of its active Assignment", () => {
    const projection = project();
    const byId = new Map(
      projection.counters.map((counter) => [counter.counterId, counter]),
    );

    expect(byId.get("counter-2")).toEqual({
      counterId: "counter-2",
      status: "active",
      serviceId: EXAMINATION,
      staffId: "staff-a",
    });
    // Counter 5's only Assignment is ended, so it carries no binding.
    expect(byId.get("counter-5")).toEqual({
      counterId: "counter-5",
      status: "inactive",
    });
    expect(byId.get("counter-4")).toEqual({
      counterId: "counter-4",
      status: "inactive",
    });
  });

  it("places active Staff at their current Service and Counter", () => {
    const projection = project();
    const byId = new Map(projection.staff.map((member) => [member.staffId, member]));

    expect(byId.get("staff-a")).toEqual({
      staffId: "staff-a",
      availability: "active",
      currentServiceId: EXAMINATION,
      currentCounterId: "counter-2",
    });
    // Vikram Rao is idle and holds no active Assignment — the activate_counter
    // candidate.
    expect(byId.get("staff-d")).toEqual({
      staffId: "staff-d",
      availability: "idle",
    });
  });

  it("carries Skills across unchanged, dropping only a null proficiency", () => {
    const projection = project({
      staffSkills: [
        { staff_id: "staff-d", service_id: EXAMINATION, proficiency: null },
      ],
    });
    expect(projection.staffSkills).toEqual([
      { staffId: "staff-d", serviceId: EXAMINATION },
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * The projection feeds the engine with no adaptation
 * ------------------------------------------------------------------ */

describe("projectFacility — feeds the engine directly", () => {
  it("hands its facility state to simulateFacility", () => {
    const projection = project();
    const result = simulateFacility({
      services: projection.services,
      horizonMinutes: 60,
    });
    expect(result.services.map((service) => service.serviceId)).toEqual([
      DOCUMENTS,
      FEES,
      EXAMINATION,
    ]);
    expect(Number.isFinite(result.totalPersonMinutesWaiting)).toBe(true);
    const examination = result.services.find(
      (service) => service.serviceId === EXAMINATION,
    );
    expect(examination?.health).toBe("critical");
  });

  it("spreads straight into recommendIntervention and recommends opening a spare Counter", () => {
    const projection = project();
    const recommendation = recommendIntervention({
      ...projection,
      horizonMinutes: 60,
      durationMinutes: 30,
      pressuredServiceId: EXAMINATION,
    });

    expect(recommendation).not.toBeNull();
    expect(recommendation?.serviceId).toBe(EXAMINATION);
    expect(recommendation?.actionType).toBe("activate_counter");
    const payload = recommendation?.actionPayload as ActivateCounterPayload;
    // Vikram Rao (idle, examination-skilled) on a spare desk.
    expect(payload.staffId).toBe("staff-d");
    expect(["counter-4", "counter-5"]).toContain(payload.counterId);
    expect(payload.serviceId).toBe(EXAMINATION);
    expect(recommendation?.estimatedMinutesReturned).toBeGreaterThan(0);
  });

  it("shows the ETA falling once the extra Assignment exists", () => {
    const before = snapshot(project(), EXAMINATION).predictedWaitMinutes;
    const after = snapshot(
      project({
        counterAssignments: [
          ...counterAssignments,
          {
            id: "asg-applied",
            counter_id: "counter-5",
            staff_id: "staff-d",
            service_id: EXAMINATION,
            assignment_type: "temporary",
            status: "active",
            started_at: ago(0),
            ends_at: ago(-30),
          },
        ],
      }),
      EXAMINATION,
    ).predictedWaitMinutes;

    expect(after).toBeLessThan(before);
    expect(after).toBeCloseTo(before / 2, 10);
  });
});

/* ------------------------------------------------------------------ *
 * Edge cases
 * ------------------------------------------------------------------ */

describe("projectFacility — edge cases", () => {
  it("projects an empty facility without throwing", () => {
    const projection = projectFacility({ services: [] }, { now: NOW });
    expect(projection).toEqual({
      observedAtMillis: NOW,
      services: [],
      queueSnapshots: [],
      counters: [],
      staff: [],
      staffSkills: [],
      serviceDetails: [],
    });
  });

  it("projects a single Service with no rows beside it", () => {
    const projection = projectFacility(
      { services: [services[2] as ServiceRow] },
      { now: NOW },
    );
    expect(projection.serviceDetails).toHaveLength(1);
    const examination = serviceDetail(projection, EXAMINATION);
    expect(examination).toMatchObject({
      serviceId: EXAMINATION,
      serviceName: "Examination Cell",
      slug: "examination",
      queueLength: 0,
      simulatedQueueLength: 0,
      realQueueLength: 0,
      activeCounters: 0,
      activeAssignmentCount: 0,
      averageServiceMinutes: 6,
      isColdStart: true,
      arrivalRatePerMinute: 0,
      downstreamArrivalRatePerMinute: 0,
      healthyThresholdMinutes: 15,
      criticalThresholdMinutes: 30,
    });
    expect(examination.queue).toEqual([]);
    expect(snapshot(projection, EXAMINATION).health).toBe("critical");
  });

  it("falls back to the engine's own thresholds when a Service omits them", () => {
    const projection = projectFacility(
      {
        services: [{ id: "svc-bare", default_service_minutes: 10 }],
        counterAssignments: [
          {
            id: "asg-bare",
            counter_id: "counter-1",
            staff_id: "staff-a",
            service_id: "svc-bare",
            status: "active",
          },
        ],
        tokens: [
          token({ id: "bare-1", service_id: "svc-bare", status: "waiting", minutesAgo: 1 }),
          token({ id: "bare-2", service_id: "svc-bare", status: "waiting", minutesAgo: 2 }),
        ],
      },
      { now: NOW },
    );
    const bare = serviceDetail(projection, "svc-bare");
    expect(bare.healthyThresholdMinutes).toBe(10);
    expect(bare.criticalThresholdMinutes).toBe(25);
    expect(bare.serviceName).toBeUndefined();
    // 2 queued x 10 min / 1 counter = 20 min -> busy on the engine defaults.
    expect(snapshot(projection, "svc-bare").health).toBe("busy");
  });

  it("keeps the first row when a Service id is duplicated", () => {
    const projection = project({
      services: [...services, { ...(services[2] as ServiceRow), default_service_minutes: 99 }],
    });
    expect(projection.serviceDetails).toHaveLength(3);
    expect(serviceDetail(projection, EXAMINATION).defaultServiceMinutes).toBe(6);
  });

  it("accepts Date and epoch timestamps as well as ISO strings", () => {
    const iso = project();
    const dates = projectFacility(
      {
        ...baseRows(),
        tokens: tokens.map((row) => ({
          ...row,
          joined_at: new Date(row.joined_at as string),
        })),
      },
      { now: new Date(NOW) },
    );
    expect(dates.serviceDetails.map((service) => service.arrivalRatePerMinute)).toEqual(
      iso.serviceDetails.map((service) => service.arrivalRatePerMinute),
    );
  });

  it("is deterministic for a fixed now", () => {
    expect(project()).toEqual(project());
  });
});

/* ------------------------------------------------------------------ *
 * One Visitor's own ETA
 * ------------------------------------------------------------------ */

describe("projectTokenEta", () => {
  it("reports people ahead and the wait for one Token", () => {
    const projection = project();
    const eta = projectTokenEta(projection, "e-4");
    expect(eta).not.toBeNull();
    expect(eta).toMatchObject({
      tokenId: "e-4",
      tokenNumber: "E-4",
      serviceId: EXAMINATION,
      position: 3,
      customersAhead: 3,
      isSimulated: false,
    });
    // 3 ahead x 7.5 min / 1 counter = 22.5 min -> busy against 15/30.
    expect(eta?.predictedWaitMinutes).toBeCloseTo(22.5, 10);
    expect(eta?.health).toBe("busy");
  });

  it("puts the Visitor at the front on zero people ahead", () => {
    const projection = project();
    const eta = projectTokenEta(projection, "e-1");
    expect(eta?.customersAhead).toBe(0);
    expect(eta?.predictedWaitMinutes).toBe(0);
    expect(eta?.health).toBe("healthy");
  });

  it("returns an infinite wait when no Counter is open", () => {
    const projection = project({
      counterAssignments: counterAssignments.map((assignment) => ({
        ...assignment,
        status: "ended" as const,
      })),
    });
    const eta = projectTokenEta(projection, "e-4");
    expect(eta?.predictedWaitMinutes).toBe(Number.POSITIVE_INFINITY);
    expect(eta?.health).toBe("critical");
  });

  it("returns null for a Token that is no longer queueing", () => {
    const projection = project();
    expect(projectTokenEta(projection, "e-serving")).toBeNull();
    expect(projectTokenEta(projection, "d-cancelled")).toBeNull();
    expect(projectTokenEta(projection, "does-not-exist")).toBeNull();
  });

  it("marks a simulated Token as simulated", () => {
    const projection = project({
      tokens: [
        ...tokens,
        token({
          id: "rush-1",
          service_id: EXAMINATION,
          status: "waiting",
          minutesAgo: 1,
          is_simulated: true,
        }),
      ],
    });
    expect(projectTokenEta(projection, "rush-1")?.isSimulated).toBe(true);
  });
});

describe("projectFacility — carries Health thresholds into the engine", () => {
  /**
   * The Digital Twin renders "now" Health from the projection's Queue Snapshot
   * and "forecast" Health from simulateFacility. Both must band the same wait
   * value identically, which only holds if the projection hands each Service's
   * own thresholds to the simulator.
   */
  it("populates each Service's thresholds on the engine's facility state", () => {
    const projection = projectFacility(baseRows(), { now: NOW });

    for (const state of projection.services) {
      const detail = findProjectedService(projection, state.serviceId);
      expect(state.healthyThresholdMinutes).toBe(detail?.healthyThresholdMinutes);
      expect(state.criticalThresholdMinutes).toBe(detail?.criticalThresholdMinutes);
    }
  });

  it("bands a zero-horizon forecast identically to the live snapshot", () => {
    const projection = projectFacility(baseRows(), { now: NOW });
    // Horizon 0 means "no time passes", so the simulated wait equals the live
    // wait and the two Health bands must agree Service by Service.
    const forecast = simulateFacility({
      services: projection.services,
      horizonMinutes: 0,
    });

    for (const simulated of forecast.services) {
      const live = findQueueSnapshot(projection, simulated.serviceId);
      expect(simulated.finalWaitMinutes).toBeCloseTo(live!.predictedWaitMinutes, 5);
      expect(simulated.health).toBe(live!.health);
    }
  });
});
