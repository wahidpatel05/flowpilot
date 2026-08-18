import { describe, expect, it } from "vitest";
import { projectFacility } from "./core";
import type {
  CounterAssignmentRow,
  CounterRow,
  FacilityRows,
  ServiceFlowEdgeRow,
  ServiceRow,
  TokenRow,
} from "./core";
import {
  buildControlViewModel,
  findControlNode,
  pickFeaturedService,
  DEFAULT_FORECAST_HORIZON_MINUTES,
} from "./controlViewModel";

/* Frozen clock so nothing here reads a wall clock. */
const NOW = Date.parse("2026-08-18T10:00:00.000Z");
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

const DOCS = "svc-docs";
const EXAM = "svc-exam";
const FEES = "svc-fees";

const services: ServiceRow[] = [
  {
    id: DOCS,
    name: "Document Verification",
    slug: "documents",
    default_service_minutes: 4,
    healthy_wait_threshold: 15,
    critical_wait_threshold: 30,
  },
  {
    id: EXAM,
    name: "Examination Cell",
    slug: "examination",
    default_service_minutes: 6,
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
];

const counters: CounterRow[] = [
  { id: "c1", name: "Counter 1", status: "active" },
  { id: "c2", name: "Counter 2", status: "active" },
  { id: "c3", name: "Counter 3", status: "active" },
];

const assignments: CounterAssignmentRow[] = [
  { id: "a1", counter_id: "c1", staff_id: "s1", service_id: DOCS, assignment_type: "primary", status: "active", started_at: ago(120) },
  { id: "a2", counter_id: "c2", staff_id: "s2", service_id: EXAM, assignment_type: "primary", status: "active", started_at: ago(120) },
  { id: "a3", counter_id: "c3", staff_id: "s3", service_id: FEES, assignment_type: "primary", status: "active", started_at: ago(120) },
];

/** `count` waiting Tokens for a Service. */
function waiting(serviceId: string, count: number, simulated = false): TokenRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${serviceId}-w${simulated ? "s" : ""}${index}`,
    service_id: serviceId,
    token_number: `T-${index}`,
    status: "waiting" as const,
    joined_at: ago(10 + index),
    is_simulated: simulated,
  }));
}

const flowEdges: ServiceFlowEdgeRow[] = [
  { from_service_id: DOCS, to_service_id: EXAM, expected_share: 0.6 },
  { from_service_id: EXAM, to_service_id: FEES, expected_share: 0.7 },
  { from_service_id: DOCS, to_service_id: FEES, expected_share: 0.3 },
];

function rows(overrides: Partial<FacilityRows> = {}): FacilityRows {
  return {
    services,
    counters,
    counterAssignments: assignments,
    tokens: [...waiting(DOCS, 3), ...waiting(EXAM, 6), ...waiting(FEES, 2)],
    staff: [],
    staffSkills: [],
    serviceFlowEdges: flowEdges,
    ...overrides,
  };
}

function build(overrides: Partial<FacilityRows> = {}, horizonMinutes?: number) {
  const projection = projectFacility(rows(overrides), { now: NOW });
  return buildControlViewModel({
    projection,
    flowEdges: overrides.serviceFlowEdges ?? flowEdges,
    ...(horizonMinutes === undefined ? {} : { horizonMinutes }),
  });
}

describe("buildControlViewModel — nodes", () => {
  it("returns one node per Service, carrying name and slug", () => {
    const vm = build();
    expect(vm.services).toHaveLength(3);
    expect(findControlNode(vm, EXAM)?.name).toBe("Examination Cell");
    expect(findControlNode(vm, EXAM)?.slug).toBe("examination");
  });

  it("reads now-values from the projection's Queue Snapshot", () => {
    const vm = build();
    const exam = findControlNode(vm, EXAM)!;
    // 6 waiting, 1 Counter, ~6 min each.
    expect(exam.now.queueLength).toBe(6);
    expect(exam.now.activeCounters).toBe(1);
    expect(exam.now.waitMinutes).toBeCloseTo(36, 0);
    expect(exam.now.health).toBe("critical");
  });

  it("defaults the forecast horizon when none is given", () => {
    expect(build().horizonMinutes).toBe(DEFAULT_FORECAST_HORIZON_MINUTES);
  });

  it("honours an explicit horizon", () => {
    expect(build({}, 30).horizonMinutes).toBe(30);
  });

  it("a zero horizon makes the forecast agree with now, band included", () => {
    const vm = build({}, 0);
    for (const node of vm.services) {
      expect(node.forecast.waitMinutes).toBeCloseTo(node.now.waitMinutes, 5);
      expect(node.forecast.health).toBe(node.now.health);
    }
  });

  it("a queue that outpaces capacity is forecast worse than now", () => {
    // One Counter on Examination against a steady stream of arrivals.
    const vm = build(
      { tokens: [...waiting(EXAM, 6), ...waiting(DOCS, 2), ...waiting(FEES, 1)] },
      30,
    );
    const exam = findControlNode(vm, EXAM)!;
    expect(exam.forecast.queueLength).toBeGreaterThan(exam.now.queueLength);
  });
});

describe("buildControlViewModel — critical callout", () => {
  it("names the critical Service rather than leaving it to be inferred", () => {
    expect(build().criticalNow).toBe(EXAM);
  });

  it("is null when no Service is critical", () => {
    const vm = build({ tokens: [...waiting(DOCS, 1), ...waiting(FEES, 1)] }, 0);
    expect(vm.criticalNow).toBeNull();
  });

  it("picks the worst wait when several are critical", () => {
    const vm = build(
      { tokens: [...waiting(EXAM, 6), ...waiting(DOCS, 20)] },
      0,
    );
    // Documents: 20 x ~4 min on one Counter beats Examination's ~36 min.
    expect(vm.criticalNow).toBe(DOCS);
  });

  it("ranks an unbounded wait above any finite one", () => {
    const vm = build(
      {
        // Fees loses its Counter while holding a queue.
        counterAssignments: assignments.filter((a) => a.service_id !== FEES),
        tokens: [...waiting(EXAM, 6), ...waiting(FEES, 1)],
      },
      0,
    );
    expect(vm.criticalNow).toBe(FEES);
  });

  it("tracks a forecast critical Service separately from the current one", () => {
    const vm = build({ tokens: waiting(EXAM, 6) }, 30);
    expect(vm.criticalForecast).toBe(EXAM);
  });
});

describe("buildControlViewModel — facility totals", () => {
  it("totals Visitors waiting across every Service", () => {
    expect(build().totals.visitorsWaiting).toBe(11);
  });

  it("counts simulated Visitors separately but includes them in the total", () => {
    const vm = build({
      tokens: [...waiting(DOCS, 2), ...waiting(EXAM, 3, true)],
    });
    expect(vm.totals.visitorsWaiting).toBe(5);
    expect(vm.totals.simulatedWaiting).toBe(3);
  });

  it("weights average wait by queue length, not a flat mean", () => {
    // Docs: 3 waiting; Exam: 6 waiting; Fees: 2 waiting.
    const vm = build({}, 0);
    const nodes = vm.services;
    const expected =
      nodes.reduce((sum, n) => sum + n.now.waitMinutes * n.now.queueLength, 0) /
      nodes.reduce((sum, n) => sum + n.now.queueLength, 0);
    expect(vm.totals.averageWaitMinutes).toBeCloseTo(expected, 5);
  });

  it("is null when nobody is waiting", () => {
    const vm = build({ tokens: [] });
    expect(vm.totals.visitorsWaiting).toBe(0);
    expect(vm.totals.averageWaitMinutes).toBeNull();
  });

  it("excludes a stalled Service from the average and counts it instead", () => {
    const vm = build({
      counterAssignments: assignments.filter((a) => a.service_id !== FEES),
      tokens: [...waiting(DOCS, 2), ...waiting(FEES, 4)],
    });
    expect(vm.totals.servicesStalled).toBe(1);
    expect(vm.totals.averageWaitMinutes).not.toBeNull();
    expect(Number.isFinite(vm.totals.averageWaitMinutes!)).toBe(true);
  });

  it("reports a null average when every waiting queue has stalled", () => {
    const vm = build({
      counterAssignments: [],
      tokens: waiting(FEES, 3),
    });
    expect(vm.totals.averageWaitMinutes).toBeNull();
    expect(vm.totals.servicesStalled).toBe(1);
  });
});

describe("buildControlViewModel — health breakdown", () => {
  it("counts each Service into its current Health band", () => {
    // Examination is critical (~36 min); Documents and Fees are healthy.
    const vm = build();
    expect(vm.healthBreakdown).toEqual({ healthy: 2, busy: 0, critical: 1 });
  });

  it("always sums to the number of Services", () => {
    const vm = build();
    const { healthy, busy, critical } = vm.healthBreakdown;
    expect(healthy + busy + critical).toBe(vm.services.length);
  });

  it("counts a stalled (zero-Counter) Service as critical, not a fourth band", () => {
    const vm = build({
      counterAssignments: assignments.filter((a) => a.service_id !== FEES),
      tokens: [...waiting(DOCS, 2), ...waiting(FEES, 4)],
    });
    expect(vm.healthBreakdown.critical).toBeGreaterThanOrEqual(1);
    expect(vm.healthBreakdown.healthy + vm.healthBreakdown.busy + vm.healthBreakdown.critical).toBe(
      vm.services.length,
    );
  });
});

describe("pickFeaturedService", () => {
  it("picks the critical Service when one exists", () => {
    const vm = build();
    expect(pickFeaturedService(vm)?.serviceId).toBe(EXAM);
  });

  it("falls back to the longest line when nothing is critical", () => {
    const vm = build({ tokens: [...waiting(DOCS, 1), ...waiting(FEES, 4)] }, 0);
    expect(vm.criticalNow).toBeNull();
    expect(pickFeaturedService(vm)?.serviceId).toBe(FEES);
  });
});

describe("buildControlViewModel — Flow Graph", () => {
  it("keeps the edges Visitors actually travel", () => {
    expect(build().edges).toHaveLength(3);
  });

  it("drops an edge pointing at a Service it does not hold", () => {
    const vm = build({
      serviceFlowEdges: [
        ...flowEdges,
        { from_service_id: DOCS, to_service_id: "svc-elsewhere", expected_share: 0.5 },
      ],
    });
    expect(vm.edges).toHaveLength(3);
  });

  it("lays entry Services at layer 0 and pushes each hop right", () => {
    const vm = build();
    expect(findControlNode(vm, DOCS)?.layer).toBe(0);
    expect(findControlNode(vm, EXAM)?.layer).toBe(1);
    // Fees is reachable from Documents directly and via Examination; the
    // longer path wins so an edge never points backwards.
    expect(findControlNode(vm, FEES)?.layer).toBe(2);
    expect(vm.maxLayer).toBe(2);
  });

  it("puts every Service at layer 0 when there is no Flow Graph", () => {
    const vm = build({ serviceFlowEdges: [] });
    expect(vm.services.every((node) => node.layer === 0)).toBe(true);
    expect(vm.maxLayer).toBe(0);
    expect(vm.edges).toHaveLength(0);
  });

  it("terminates on a cyclic Flow Graph instead of looping forever", () => {
    const vm = build({
      serviceFlowEdges: [
        { from_service_id: DOCS, to_service_id: EXAM, expected_share: 0.5 },
        { from_service_id: EXAM, to_service_id: FEES, expected_share: 0.5 },
        { from_service_id: FEES, to_service_id: DOCS, expected_share: 0.5 },
      ],
    });
    expect(vm.services).toHaveLength(3);
    for (const node of vm.services) {
      expect(Number.isFinite(node.layer)).toBe(true);
    }
  });
});

describe("buildControlViewModel — per-Service queue detail", () => {
  it("carries the queue in call order with each Visitor's own wait", () => {
    const exam = findControlNode(build(), EXAM)!;
    // 6 waiting, 1 Counter, 6 min each: position 0 waits 0, position 5 waits 30.
    expect(exam.detail.queue).toHaveLength(6);
    expect(exam.detail.queue.map((entry) => entry.position)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(exam.detail.queue[0]!.waitMinutes).toBeCloseTo(0, 5);
    expect(exam.detail.queue[5]!.waitMinutes).toBeCloseTo(30, 0);
  });

  it("agrees with the Service's headline wait at the back of the line", () => {
    // The headline is the wait a Visitor joining now would face, which is one
    // service time beyond the last person already in line.
    const exam = findControlNode(build(), EXAM)!;
    const last = exam.detail.queue.at(-1)!;
    expect(exam.now.waitMinutes - last.waitMinutes).toBeCloseTo(
      exam.detail.averageServiceMinutes,
      5,
    );
  });

  it("labels a Simulate Rush Token so a drill-in can never hide it", () => {
    const vm = build({
      tokens: [...waiting(EXAM, 2), ...waiting(EXAM, 3, true)],
    });
    const exam = findControlNode(vm, EXAM)!;
    expect(exam.detail.queue.filter((entry) => entry.isSimulated)).toHaveLength(3);
    expect(exam.detail.realQueueLength).toBe(2);
    expect(exam.now.simulatedQueueLength).toBe(3);
  });

  it("reports an unbounded wait per Visitor when no Counter is open", () => {
    const exam = findControlNode(
      build({ counterAssignments: assignments.filter((a) => a.service_id !== EXAM) }),
      EXAM,
    )!;
    expect(exam.now.activeCounters).toBe(0);
    expect(exam.detail.queue.every((entry) => entry.waitMinutes === Number.POSITIVE_INFINITY)).toBe(
      true,
    );
  });

  it("carries the thresholds the Health band was decided against", () => {
    const exam = findControlNode(build(), EXAM)!;
    expect(exam.detail.healthyThresholdMinutes).toBe(15);
    expect(exam.detail.criticalThresholdMinutes).toBe(30);
  });

  it("carries the service-time provenance, so a cold start is visible", () => {
    const exam = findControlNode(build(), EXAM)!;
    expect(exam.isColdStart).toBe(true);
    expect(exam.detail.completedDurationSampleCount).toBe(0);
    expect(exam.detail.averageServiceMinutes).toBe(6);
    expect(exam.detail.defaultServiceMinutes).toBe(6);
  });

  it("holds an empty queue for a Service with nobody in line", () => {
    const vm = build({ tokens: [] });
    for (const node of vm.services) {
      expect(node.detail.queue).toEqual([]);
      expect(node.detail.realQueueLength).toBe(0);
    }
  });
});

describe("findControlNode", () => {
  it("returns undefined for a null id, so a missing callout is safe", () => {
    expect(findControlNode(build(), null)).toBeUndefined();
  });

  it("returns undefined for an unknown id", () => {
    expect(findControlNode(build(), "nope")).toBeUndefined();
  });
});
