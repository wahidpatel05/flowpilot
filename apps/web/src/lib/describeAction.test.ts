import { describe, expect, it } from "vitest";
import { describeAppliedMove, describeMove } from "./describeAction";
import type { ActionShape } from "./recommendationRow";

const names = {
  staffNames: { s7: "Priya Sharma" },
  counterNames: { c4: "Counter 4" },
  serviceNames: { "svc-fees": "Fees", "svc-docs": "Document Verification" },
};

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const activate: ActionShape = {
  action_type: "activate_counter",
  action_payload: { counterId: "c4", staffId: "s7", serviceId: "svc-fees", durationMinutes: 45 },
};

const reassign: ActionShape = {
  action_type: "reassign_staff",
  action_payload: {
    staffId: "s7",
    counterId: "c4",
    fromServiceId: "svc-docs",
    toServiceId: "svc-fees",
    durationMinutes: 30,
  },
};

describe("describeMove", () => {
  it("names the Counter, Staff member and Service for activate_counter", () => {
    expect(describeMove(activate, names)).toBe("Open Counter 4 with Priya Sharma for Fees.");
  });

  it("names both Services for reassign_staff", () => {
    expect(describeMove(reassign, names)).toBe(
      "Move Priya Sharma from Document Verification to Fees, at Counter 4.",
    );
  });

  it("never renders a raw identifier, even with an empty lookup", () => {
    const blank = { staffNames: {}, counterNames: {}, serviceNames: {} };
    const sentence = describeMove(
      {
        action_type: "reassign_staff",
        action_payload: {
          staffId: "8f14e45f-ceea-467a-9dfd-1d0c2fa4b0c3",
          counterId: "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0",
          fromServiceId: "1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9",
          toServiceId: "9f8e7d6c-5b4a-4392-8180-7f6e5d4c3b2a",
        },
      },
      blank,
    );
    expect(sentence).toBe(
      "Move the staff member from their current service to the service, at the counter.",
    );
    expect(sentence).not.toMatch(UUID);
  });

  it("falls back to the row's own Service when the payload names none", () => {
    expect(
      describeMove(
        { action_type: "activate_counter", action_payload: { counterId: "c4", staffId: "s7" }, service_id: "svc-fees" },
        names,
      ),
    ).toBe("Open Counter 4 with Priya Sharma for Fees.");
  });
});

describe("describeAppliedMove", () => {
  it("reads in the past tense and carries the duration", () => {
    expect(describeAppliedMove(activate, names)).toBe(
      "Counter 4 opened for Fees. Priya Sharma is serving there for the next 45 minutes.",
    );
    expect(describeAppliedMove(reassign, names)).toBe(
      "Priya Sharma moved from Document Verification to Fees at Counter 4 for the next 30 minutes.",
    );
  });

  it("uses the engine's default duration when the payload omits one", () => {
    expect(
      describeAppliedMove(
        { action_type: "activate_counter", action_payload: { counterId: "c4", staffId: "s7", serviceId: "svc-fees" } },
        names,
      ),
    ).toContain("the next 30 minutes");
  });
});
