import { describe, expect, it } from "vitest";
import {
  assignmentDurationMinutes,
  destinationServiceId,
  findIncomingAssignment,
  type InterventionRow,
} from "./interventionTarget";

const COUNTER_A = "counter-a";
const COUNTER_B = "counter-b";

function row(overrides: Partial<InterventionRow>): InterventionRow {
  return {
    id: "int-1",
    status: "approved",
    action_type: "activate_counter",
    action_payload: { counterId: COUNTER_A, staffId: "staff-1", serviceId: "service-1", durationMinutes: 30 },
    estimated_minutes_returned: 12,
    created_at: "2026-08-18T10:00:00.000Z",
    ...overrides,
  };
}

describe("findIncomingAssignment", () => {
  it("finds an approved intervention targeting this counter", () => {
    const found = findIncomingAssignment([row({})], COUNTER_A);
    expect(found?.id).toBe("int-1");
  });

  it("ignores interventions targeting a different counter", () => {
    const found = findIncomingAssignment(
      [row({ action_payload: { ...row({}).action_payload, counterId: COUNTER_B } })],
      COUNTER_A,
    );
    expect(found).toBeNull();
  });

  it("ignores interventions not in an incoming status", () => {
    const found = findIncomingAssignment([row({ status: "applied" })], COUNTER_A);
    expect(found).toBeNull();
  });

  it("accepts pending_staff as an incoming status", () => {
    const found = findIncomingAssignment([row({ status: "pending_staff" })], COUNTER_A);
    expect(found?.id).toBe("int-1");
  });

  it("still surfaces an accepted intervention, so a failed apply can be retried", () => {
    const found = findIncomingAssignment([row({ status: "accepted" })], COUNTER_A);
    expect(found?.id).toBe("int-1");
  });

  it("picks the most recently created match when several exist", () => {
    const older = row({ id: "int-old", created_at: "2026-08-18T09:00:00.000Z" });
    const newer = row({ id: "int-new", created_at: "2026-08-18T11:00:00.000Z" });
    const found = findIncomingAssignment([older, newer], COUNTER_A);
    expect(found?.id).toBe("int-new");
  });

  it("returns null when there is no match", () => {
    expect(findIncomingAssignment([], COUNTER_A)).toBeNull();
  });
});

describe("destinationServiceId", () => {
  it("reads serviceId for activate_counter", () => {
    expect(destinationServiceId(row({}))).toBe("service-1");
  });

  it("reads toServiceId for reassign_staff", () => {
    const reassign = row({
      action_type: "reassign_staff",
      action_payload: {
        staffId: "staff-1",
        counterId: COUNTER_A,
        fromServiceId: "service-1",
        toServiceId: "service-2",
        durationMinutes: 20,
      },
    });
    expect(destinationServiceId(reassign)).toBe("service-2");
  });

  it("returns undefined when the payload is missing the field", () => {
    expect(destinationServiceId(row({ action_payload: {} }))).toBeUndefined();
  });
});

describe("assignmentDurationMinutes", () => {
  it("reads durationMinutes from the payload", () => {
    expect(assignmentDurationMinutes(row({}))).toBe(30);
  });

  it("falls back to 30 when missing or malformed", () => {
    expect(assignmentDurationMinutes(row({ action_payload: {} }))).toBe(30);
    expect(assignmentDurationMinutes(row({ action_payload: { durationMinutes: "oops" } }))).toBe(30);
  });
});
