import { describe, expect, it } from "vitest";
import { recommendationParties, type RecommendationRow } from "./recommendationRow";

function row(overrides: Partial<RecommendationRow>): RecommendationRow {
  return {
    id: "rec-1",
    service_id: "service-exam",
    action_type: "activate_counter",
    action_payload: {
      counterId: "counter-2",
      staffId: "staff-9",
      serviceId: "service-exam",
      durationMinutes: 30,
    },
    baseline_wait: 36,
    predicted_wait: 18,
    baseline_person_minutes: 220,
    predicted_person_minutes: 90,
    estimated_minutes_returned: 130,
    confidence: "high",
    status: "recommended",
    created_at: "2026-08-18T10:00:00.000Z",
    ...overrides,
  };
}

describe("recommendationParties", () => {
  it("reads counterId/staffId/serviceId for activate_counter, with no fromServiceId", () => {
    const parties = recommendationParties(row({}));
    expect(parties).toEqual({
      staffId: "staff-9",
      counterId: "counter-2",
      fromServiceId: undefined,
      toServiceId: "service-exam",
      durationMinutes: 30,
    });
  });

  it("reads fromServiceId/toServiceId for reassign_staff", () => {
    const reassign = row({
      action_type: "reassign_staff",
      action_payload: {
        staffId: "staff-9",
        counterId: "counter-4",
        fromServiceId: "service-fees",
        toServiceId: "service-exam",
        durationMinutes: 20,
      },
    });
    expect(recommendationParties(reassign)).toEqual({
      staffId: "staff-9",
      counterId: "counter-4",
      fromServiceId: "service-fees",
      toServiceId: "service-exam",
      durationMinutes: 20,
    });
  });

  it("falls back toServiceId to the recommendation's own service_id when the payload omits it", () => {
    const parties = recommendationParties(row({ action_payload: {} }));
    expect(parties.toServiceId).toBe("service-exam");
  });

  it("falls back durationMinutes to 30 when missing or malformed", () => {
    expect(recommendationParties(row({ action_payload: {} })).durationMinutes).toBe(30);
    expect(
      recommendationParties(row({ action_payload: { durationMinutes: "oops" } })).durationMinutes,
    ).toBe(30);
  });

  it("leaves staffId/counterId undefined when the payload is malformed rather than throwing", () => {
    const parties = recommendationParties(row({ action_payload: { staffId: 42 } }));
    expect(parties.staffId).toBeUndefined();
  });
});
