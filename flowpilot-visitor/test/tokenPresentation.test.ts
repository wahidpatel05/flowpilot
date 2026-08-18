/**
 * The Live Token seam: a raw Token row, plus a projection scoped to its
 * Service, become what the Visitor reads. Same discipline as catalogue.test.ts
 * — drive it through projectFacility, because that is the real path, and every
 * number must come from a QueueSnapshot, never from arithmetic written here.
 */
import { describe, expect, it } from "vitest";
import { projectFacility } from "@flowpilot/core";
import type {
  CounterAssignmentRow,
  FacilityRows,
  ServiceRow,
  TokenRow,
} from "@flowpilot/core";
import { buildLiveTokenModel } from "../src/token/tokenPresentation";

const NOW = Date.parse("2026-08-18T10:00:00.000Z");

function serviceRow(overrides: Partial<ServiceRow> & { id: string }): ServiceRow {
  return {
    name: "Examination Cell",
    slug: "examination",
    default_service_minutes: 4,
    healthy_wait_threshold: 15,
    critical_wait_threshold: 30,
    ...overrides,
  };
}

function tokenRow(overrides: Partial<TokenRow> & { id: string }): TokenRow {
  return {
    service_id: "svc-a",
    token_number: "E-042",
    status: "waiting",
    joined_at: NOW - 60_000,
    ...overrides,
  };
}

function assignment(id: string, serviceId: string, counterId: string): CounterAssignmentRow {
  return {
    id,
    counter_id: counterId,
    staff_id: `staff-${counterId}`,
    service_id: serviceId,
    assignment_type: "primary",
    status: "active",
  };
}

/** `count` other waiting Tokens ahead of `myToken`, joined earlier. */
function tokensAhead(serviceId: string, count: number): TokenRow[] {
  return Array.from({ length: count }, (_, index) =>
    tokenRow({
      id: `ahead-${index}`,
      service_id: serviceId,
      token_number: `E-${index}`,
      joined_at: NOW - (count - index + 5) * 60_000,
    }),
  );
}

function project(rows: FacilityRows) {
  return projectFacility(rows, { now: NOW });
}

describe("buildLiveTokenModel — waiting", () => {
  it("takes people-ahead and ETA from the engine's projection", () => {
    const myToken = tokenRow({ id: "my-token", service_id: "svc-a" });
    const rows: FacilityRows = {
      services: [serviceRow({ id: "svc-a" })],
      counterAssignments: [assignment("a1", "svc-a", "counter-1")],
      tokens: [...tokensAhead("svc-a", 3), myToken],
    };

    const model = buildLiveTokenModel({
      token: myToken,
      serviceName: "Examination Cell",
      projection: project(rows),
    });

    // 3 ahead * 4 min / 1 counter = 12 min, under the healthy threshold of 15.
    expect(model.customersAhead).toBe(3);
    expect(model.etaMinutes).toBe(12);
    expect(model.headline).toBe("12 min");
    expect(model.subheadline).toBe("3 people ahead");
    expect(model.health).toBe("healthy");
    expect(model.healthLabel).toBe("Healthy");
    expect(model.isTerminal).toBe(false);
  });

  it("says You're next when nobody is ahead", () => {
    const myToken = tokenRow({ id: "my-token", service_id: "svc-a" });
    const rows: FacilityRows = {
      services: [serviceRow({ id: "svc-a" })],
      counterAssignments: [assignment("a1", "svc-a", "counter-1")],
      tokens: [myToken],
    };

    const model = buildLiveTokenModel({
      token: myToken,
      serviceName: "Examination Cell",
      projection: project(rows),
    });

    expect(model.customersAhead).toBe(0);
    expect(model.subheadline).toBe("You're next!");
  });

  it("reads Closed rather than an infinite wait when no Counter is open", () => {
    const myToken = tokenRow({ id: "my-token", service_id: "svc-a" });
    const rows: FacilityRows = {
      services: [serviceRow({ id: "svc-a" })],
      counters: [{ id: "counter-1", status: "active" }],
      tokens: [myToken],
    };

    const model = buildLiveTokenModel({
      token: myToken,
      serviceName: "Examination Cell",
      projection: project(rows),
    });

    expect(model.etaMinutes).toBeNull();
    expect(model.headline).toBe("No counter open");
    expect(model.healthLabel).toBe("Closed");
  });
});

describe("buildLiveTokenModel — other statuses", () => {
  it("shows a clear status when the Token has been called, without a stale ETA", () => {
    const myToken = tokenRow({ id: "my-token", service_id: "svc-a", status: "called" });
    const rows: FacilityRows = {
      services: [serviceRow({ id: "svc-a" })],
      counterAssignments: [assignment("a1", "svc-a", "counter-1")],
      tokens: [myToken],
    };

    const model = buildLiveTokenModel({
      token: myToken,
      serviceName: "Examination Cell",
      projection: project(rows),
    });

    expect(model.headline).toBe("You're being called");
    expect(model.subheadline).toBe("Please go to the counter now.");
    expect(model.etaMinutes).toBeNull();
    expect(model.customersAhead).toBeNull();
    expect(model.healthLabel).toBeNull();
    expect(model.isTerminal).toBe(false);
  });

  it("shows being served with no projection needed", () => {
    const myToken = tokenRow({ id: "my-token", status: "serving" });

    const model = buildLiveTokenModel({
      token: myToken,
      serviceName: "Examination Cell",
      projection: null,
    });

    expect(model.headline).toBe("You're being served");
    expect(model.isTerminal).toBe(false);
  });

  it.each([
    ["completed", "All done", "Thanks for visiting."],
    ["cancelled", "Cancelled", "You left this queue."],
    ["skipped", "Missed your call", "Rejoin the queue if you still need this Service."],
  ] as const)("marks %s as terminal: %s / %s", (status, headline, subheadline) => {
    const myToken = tokenRow({ id: "my-token", status });

    const model = buildLiveTokenModel({
      token: myToken,
      serviceName: "Examination Cell",
      projection: null,
    });

    expect(model.headline).toBe(headline);
    expect(model.subheadline).toBe(subheadline);
    expect(model.isTerminal).toBe(true);
  });

  it("carries the Token number and Service name through untouched", () => {
    const myToken = tokenRow({ id: "my-token", token_number: "E-042" });

    const model = buildLiveTokenModel({
      token: myToken,
      serviceName: "Examination Cell",
      projection: null,
    });

    expect(model.tokenNumber).toBe("E-042");
    expect(model.serviceName).toBe("Examination Cell");
    expect(model.tokenId).toBe("my-token");
  });
});
