/**
 * The Service catalogue seam.
 *
 * These tests drive rows -> projectFacility -> cards, because that is the path
 * the phone actually takes. If the catalogue ever grows its own arithmetic, a
 * test here should be the thing that fails: the engine owns wait and Health,
 * and this module owns nothing but wording.
 */
import { describe, expect, it } from "vitest";
import { projectFacility } from "@flowpilot/core";
import type {
  CounterAssignmentRow,
  FacilityRows,
  ServiceRow,
  TokenRow,
} from "@flowpilot/core";
import { buildServiceCatalogue } from "../src/facility/catalogue";

const NOW = Date.parse("2026-08-18T10:00:00.000Z");

function serviceRow(overrides: Partial<ServiceRow> & { id: string }): ServiceRow {
  return {
    name: "Document Verification",
    slug: "documents",
    default_service_minutes: 4,
    healthy_wait_threshold: 15,
    critical_wait_threshold: 30,
    ...overrides,
  };
}

/** `count` Tokens queued on `serviceId`, all still waiting. */
function waitingTokens(serviceId: string, count: number): TokenRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `token-${serviceId}-${index}`,
    service_id: serviceId,
    token_number: `D-${index}`,
    status: "waiting" as const,
    joined_at: NOW - (count - index) * 60_000,
  }));
}

/** One active Assignment — the only thing that counts as capacity (ADR-0001). */
function assignment(
  id: string,
  serviceId: string,
  counterId: string,
): CounterAssignmentRow {
  return {
    id,
    counter_id: counterId,
    staff_id: `staff-${counterId}`,
    service_id: serviceId,
    assignment_type: "primary",
    status: "active",
  };
}

function cataloguedFrom(rows: FacilityRows) {
  return buildServiceCatalogue(projectFacility(rows, { now: NOW }));
}

describe("buildServiceCatalogue", () => {
  it("returns one card per Service, in catalogue order", () => {
    const cards = cataloguedFrom({
      services: [
        serviceRow({ id: "svc-a", name: "Document Verification" }),
        serviceRow({ id: "svc-b", name: "Fees", slug: "fees" }),
      ],
    });

    expect(cards.map((card) => card.serviceId)).toEqual(["svc-a", "svc-b"]);
    expect(cards.map((card) => card.name)).toEqual([
      "Document Verification",
      "Fees",
    ]);
  });

  it("takes queue length and wait from the engine, not from its own arithmetic", () => {
    // 6 waiting, 4 min each, 2 counters -> the engine's answer is 12 min.
    const cards = cataloguedFrom({
      services: [serviceRow({ id: "svc-a" })],
      counterAssignments: [
        assignment("a1", "svc-a", "counter-1"),
        assignment("a2", "svc-a", "counter-2"),
      ],
      tokens: waitingTokens("svc-a", 6),
    });

    const card = cards[0]!;
    expect(card.queueLength).toBe(6);
    expect(card.activeCounters).toBe(2);
    expect(card.waitMinutes).toBe(12);
    expect(card.waitLabel).toBe("12 min");
  });

  it("reports Health as a word and a level, never as colour alone", () => {
    const cards = cataloguedFrom({
      services: [serviceRow({ id: "svc-a" })],
      counterAssignments: [assignment("a1", "svc-a", "counter-1")],
      tokens: waitingTokens("svc-a", 2), // 2 * 4 / 1 = 8 min, under healthy 15
    });

    const card = cards[0]!;
    expect(card.health).toBe("healthy");
    expect(card.healthLabel).toBe("Healthy");
  });

  it("escalates Health through busy to critical as the wait grows", () => {
    const busy = cataloguedFrom({
      services: [serviceRow({ id: "svc-a" })],
      counterAssignments: [assignment("a1", "svc-a", "counter-1")],
      tokens: waitingTokens("svc-a", 5), // 20 min: over healthy, under critical
    })[0]!;
    expect(busy.health).toBe("busy");
    expect(busy.healthLabel).toBe("Busy");

    const critical = cataloguedFrom({
      services: [serviceRow({ id: "svc-a" })],
      counterAssignments: [assignment("a1", "svc-a", "counter-1")],
      tokens: waitingTokens("svc-a", 10), // 40 min: at or over critical
    })[0]!;
    expect(critical.health).toBe("critical");
    expect(critical.healthLabel).toBe("Critical");
  });

  it("says a Service is closed rather than showing an infinite wait", () => {
    // Tokens queued, but no active Assignment: the engine returns Infinity.
    const card = cataloguedFrom({
      services: [serviceRow({ id: "svc-a" })],
      counters: [{ id: "counter-1", status: "active" }],
      tokens: waitingTokens("svc-a", 3),
    })[0]!;

    expect(card.isOpen).toBe(false);
    expect(card.activeCounters).toBe(0);
    expect(card.waitMinutes).toBeNull();
    expect(card.waitLabel).toBe("No counter open");
    // The engine is right that an unbounded wait is critical, but "Closed" is
    // the more actionable word for a Visitor, and the design has an indicator
    // for exactly this. The canonical Health value is left untouched.
    expect(card.health).toBe("critical");
    expect(card.healthLabel).toBe("Closed");
  });

  it("phrases the queue in people, and singularises one person", () => {
    const labelFor = (count: number) =>
      cataloguedFrom({
        services: [serviceRow({ id: "svc-a" })],
        counterAssignments: [assignment("a1", "svc-a", "counter-1")],
        tokens: waitingTokens("svc-a", count),
      })[0]!.queueLabel;

    expect(labelFor(0)).toBe("No one waiting");
    expect(labelFor(1)).toBe("1 person");
    expect(labelFor(4)).toBe("4 people");
  });

  it("joins queue and wait into the one meta line the card renders", () => {
    const card = cataloguedFrom({
      services: [serviceRow({ id: "svc-a" })],
      counterAssignments: [assignment("a1", "svc-a", "counter-1")],
      tokens: waitingTokens("svc-a", 4), // 4 * 4 / 1 = 16 min
    })[0]!;

    expect(card.metaLabel).toBe("4 people · 16 min");
  });

  it("calls an empty open queue no wait rather than 0 min", () => {
    const card = cataloguedFrom({
      services: [serviceRow({ id: "svc-a" })],
      counterAssignments: [assignment("a1", "svc-a", "counter-1")],
      tokens: [],
    })[0]!;

    expect(card.isOpen).toBe(true);
    expect(card.waitMinutes).toBe(0);
    expect(card.waitLabel).toBe("No wait");
  });

  it("counts a Token that has been called but not yet served as still queueing", () => {
    const tokens = waitingTokens("svc-a", 3);
    tokens[0]!.status = "called";

    const card = cataloguedFrom({
      services: [serviceRow({ id: "svc-a" })],
      counterAssignments: [assignment("a1", "svc-a", "counter-1")],
      tokens,
    })[0]!;

    expect(card.queueLength).toBe(3);
  });
});
