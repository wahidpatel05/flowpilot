import { describe, expect, it } from "vitest";
import { recommendIntervention } from "../src/recommendation/recommend.js";
import { simulateFacility } from "../src/simulation/simulate.js";
import type {
  ActivateCounterPayload,
  FacilityServiceState,
  ReassignStaffPayload,
} from "../src/types.js";

/** Pressured service: 40 waiting, one counter, 5 min each -> 200 min wait. */
const pressuredBilling: FacilityServiceState = {
  serviceId: "billing",
  queueLength: 40,
  activeCounters: 1,
  averageServiceMinutes: 5,
  arrivalRatePerMinute: 1,
};

/** Calm service with slack: short queue, two counters. */
const calmInfo: FacilityServiceState = {
  serviceId: "info",
  queueLength: 2,
  activeCounters: 2,
  averageServiceMinutes: 3,
  arrivalRatePerMinute: 0.1,
};

describe("recommendIntervention — P1 activate_counter", () => {
  it("activates an inactive counter with an idle skilled staff member", () => {
    const recommendation = recommendIntervention({
      services: [pressuredBilling, calmInfo],
      counters: [
        { counterId: "c-1", status: "active", serviceId: "billing", staffId: "s-1" },
        { counterId: "c-2", status: "active", serviceId: "info", staffId: "s-2" },
        { counterId: "c-3", status: "active", serviceId: "info", staffId: "s-3" },
        {
          counterId: "c-9",
          status: "inactive",
          eligibleServiceIds: ["billing"],
        },
      ],
      staff: [
        {
          staffId: "s-1",
          availability: "active",
          currentServiceId: "billing",
          currentCounterId: "c-1",
        },
        {
          staffId: "s-2",
          availability: "active",
          currentServiceId: "info",
          currentCounterId: "c-2",
        },
        {
          staffId: "s-3",
          availability: "active",
          currentServiceId: "info",
          currentCounterId: "c-3",
        },
        { staffId: "s-7", availability: "idle" },
      ],
      staffSkills: [
        { staffId: "s-1", serviceId: "billing" },
        { staffId: "s-2", serviceId: "info" },
        { staffId: "s-3", serviceId: "info" },
        { staffId: "s-3", serviceId: "billing" },
        { staffId: "s-7", serviceId: "billing" },
      ],
      horizonMinutes: 60,
    });

    expect(recommendation).not.toBeNull();
    expect(recommendation!.actionType).toBe("activate_counter");
    expect(recommendation!.serviceId).toBe("billing");

    const payload = recommendation!.actionPayload as ActivateCounterPayload;
    expect(payload.counterId).toBe("c-9");
    expect(payload.staffId).toBe("s-7");
    expect(payload.serviceId).toBe("billing");
    expect(payload.durationMinutes).toBeGreaterThan(0);

    expect(recommendation!.estimatedMinutesReturned).toBeGreaterThan(0);
    expect(recommendation!.estimatedMinutesReturned).toBeCloseTo(
      recommendation!.baselinePersonMinutes -
        recommendation!.optimizedPersonMinutes,
      6,
    );
    expect(recommendation!.optimizedWaitMinutes).toBeLessThan(
      recommendation!.baselineWaitMinutes,
    );
    expect(recommendation!.confidence).toBeDefined();
  });
});

describe("recommendIntervention — P2 reassign_staff", () => {
  it("falls back to a temporary reassignment when no counter is idle", () => {
    const recommendation = recommendIntervention({
      services: [pressuredBilling, calmInfo],
      counters: [
        { counterId: "c-1", status: "active", serviceId: "billing", staffId: "s-1" },
        { counterId: "c-2", status: "active", serviceId: "info", staffId: "s-2" },
        { counterId: "c-3", status: "active", serviceId: "info", staffId: "s-3" },
      ],
      staff: [
        {
          staffId: "s-1",
          availability: "active",
          currentServiceId: "billing",
          currentCounterId: "c-1",
        },
        {
          staffId: "s-2",
          availability: "active",
          currentServiceId: "info",
          currentCounterId: "c-2",
        },
        {
          staffId: "s-3",
          availability: "active",
          currentServiceId: "info",
          currentCounterId: "c-3",
        },
      ],
      staffSkills: [
        { staffId: "s-1", serviceId: "billing" },
        { staffId: "s-2", serviceId: "info" },
        { staffId: "s-3", serviceId: "info" },
        { staffId: "s-3", serviceId: "billing" },
      ],
      horizonMinutes: 60,
    });

    expect(recommendation).not.toBeNull();
    expect(recommendation!.actionType).toBe("reassign_staff");

    const payload = recommendation!.actionPayload as ReassignStaffPayload;
    expect(payload.staffId).toBe("s-3");
    expect(payload.counterId).toBe("c-3");
    expect(payload.fromServiceId).toBe("info");
    expect(payload.toServiceId).toBe("billing");
    expect(payload.durationMinutes).toBeGreaterThan(0);
    expect(recommendation!.estimatedMinutesReturned).toBeGreaterThan(0);
  });

  it("never emits reassign_counter — physical counters do not move", () => {
    const recommendation = recommendIntervention({
      services: [pressuredBilling, calmInfo],
      counters: [
        { counterId: "c-1", status: "active", serviceId: "billing", staffId: "s-1" },
        { counterId: "c-2", status: "active", serviceId: "info", staffId: "s-2" },
        { counterId: "c-3", status: "active", serviceId: "info", staffId: "s-3" },
      ],
      staff: [
        {
          staffId: "s-1",
          availability: "active",
          currentServiceId: "billing",
          currentCounterId: "c-1",
        },
        {
          staffId: "s-2",
          availability: "active",
          currentServiceId: "info",
          currentCounterId: "c-2",
        },
        {
          staffId: "s-3",
          availability: "active",
          currentServiceId: "info",
          currentCounterId: "c-3",
        },
      ],
      staffSkills: [
        { staffId: "s-3", serviceId: "billing" },
        { staffId: "s-3", serviceId: "info" },
      ],
    });

    expect(recommendation).not.toBeNull();
    expect(["activate_counter", "reassign_staff"]).toContain(
      recommendation!.actionType,
    );
  });
});

describe("recommendIntervention — validation", () => {
  it("returns null when the only skilled staff would strand the source service at zero counters", () => {
    const soloInfo: FacilityServiceState = {
      ...calmInfo,
      activeCounters: 1,
    };

    const recommendation = recommendIntervention({
      services: [pressuredBilling, soloInfo],
      counters: [
        { counterId: "c-1", status: "active", serviceId: "billing", staffId: "s-1" },
        { counterId: "c-2", status: "active", serviceId: "info", staffId: "s-2" },
      ],
      staff: [
        {
          staffId: "s-1",
          availability: "active",
          currentServiceId: "billing",
          currentCounterId: "c-1",
        },
        {
          staffId: "s-2",
          availability: "active",
          currentServiceId: "info",
          currentCounterId: "c-2",
        },
      ],
      staffSkills: [
        { staffId: "s-1", serviceId: "billing" },
        { staffId: "s-2", serviceId: "info" },
        { staffId: "s-2", serviceId: "billing" },
      ],
      horizonMinutes: 60,
    });

    expect(recommendation).toBeNull();
  });

  it("returns null when no unskilled staff can cover the pressured service", () => {
    const recommendation = recommendIntervention({
      services: [pressuredBilling, calmInfo],
      counters: [
        { counterId: "c-1", status: "active", serviceId: "billing", staffId: "s-1" },
        { counterId: "c-9", status: "inactive", eligibleServiceIds: ["billing"] },
      ],
      staff: [
        {
          staffId: "s-1",
          availability: "active",
          currentServiceId: "billing",
          currentCounterId: "c-1",
        },
        { staffId: "s-8", availability: "idle" },
      ],
      // s-8 is idle but only knows "info".
      staffSkills: [{ staffId: "s-8", serviceId: "info" }],
    });

    expect(recommendation).toBeNull();
  });

  it("returns null when no move produces positive savings", () => {
    const quietBilling: FacilityServiceState = {
      serviceId: "billing",
      queueLength: 0,
      activeCounters: 1,
      averageServiceMinutes: 4,
      arrivalRatePerMinute: 0,
    };

    const recommendation = recommendIntervention({
      services: [quietBilling],
      counters: [
        { counterId: "c-1", status: "active", serviceId: "billing", staffId: "s-1" },
        { counterId: "c-9", status: "inactive", eligibleServiceIds: ["billing"] },
      ],
      staff: [
        {
          staffId: "s-1",
          availability: "active",
          currentServiceId: "billing",
          currentCounterId: "c-1",
        },
        { staffId: "s-7", availability: "idle" },
      ],
      staffSkills: [{ staffId: "s-7", serviceId: "billing" }],
      horizonMinutes: 60,
    });

    // A skilled idle staffer and a free counter exist, but the queue is empty:
    // the counterfactual saves nothing, so there is nothing to recommend.
    expect(recommendation).toBeNull();
  });
});

describe("recommendIntervention — anti-cheating (full cost accounting)", () => {
  /**
   * Destination "passport" is mildly pressured and already drains quickly, so
   * an extra counter there buys very little. Source "visa" is badly backed up
   * with slow service, so removing one of its two counters is devastating.
   *
   * Evaluating the destination in isolation shows a positive gain — the trap.
   * Charging the source-service damage flips the score negative, so the move
   * MUST be rejected.
   */
  const passport: FacilityServiceState = {
    serviceId: "passport",
    queueLength: 5,
    activeCounters: 1,
    averageServiceMinutes: 1, // capacity 1.0/min
    arrivalRatePerMinute: 0.1,
  };

  const visa: FacilityServiceState = {
    serviceId: "visa",
    queueLength: 100,
    activeCounters: 2,
    averageServiceMinutes: 10, // capacity 0.2/min vs 0.5/min arrivals
    arrivalRatePerMinute: 0.5,
  };

  const horizonMinutes = 60;

  it("would look beneficial if only the destination service were simulated", () => {
    const destinationOnlyBefore = simulateFacility({
      services: [passport],
      horizonMinutes,
    });
    const destinationOnlyAfter = simulateFacility({
      services: [{ ...passport, activeCounters: 2 }],
      horizonMinutes,
    });

    expect(
      destinationOnlyBefore.totalPersonMinutesWaiting -
        destinationOnlyAfter.totalPersonMinutesWaiting,
    ).toBeGreaterThan(0);
  });

  it("rejects the reassignment because the source-service damage exceeds the destination gain", () => {
    const baseline = simulateFacility({
      services: [passport, visa],
      horizonMinutes,
    });
    const withMove = simulateFacility({
      services: [
        { ...passport, activeCounters: 2 },
        { ...visa, activeCounters: 1 },
      ],
      horizonMinutes,
    });

    // Sanity: the honest, whole-facility counterfactual is strictly worse.
    expect(withMove.totalPersonMinutesWaiting).toBeGreaterThan(
      baseline.totalPersonMinutesWaiting,
    );

    const recommendation = recommendIntervention({
      services: [passport, visa],
      counters: [
        {
          counterId: "c-p1",
          status: "active",
          serviceId: "passport",
          staffId: "s-p1",
        },
        { counterId: "c-v1", status: "active", serviceId: "visa", staffId: "s-v1" },
        { counterId: "c-v2", status: "active", serviceId: "visa", staffId: "s-v2" },
      ],
      staff: [
        {
          staffId: "s-p1",
          availability: "active",
          currentServiceId: "passport",
          currentCounterId: "c-p1",
        },
        {
          staffId: "s-v1",
          availability: "active",
          currentServiceId: "visa",
          currentCounterId: "c-v1",
        },
        {
          staffId: "s-v2",
          availability: "active",
          currentServiceId: "visa",
          currentCounterId: "c-v2",
        },
      ],
      staffSkills: [
        { staffId: "s-p1", serviceId: "passport" },
        { staffId: "s-v1", serviceId: "visa" },
        // s-v2 IS skilled for passport and visa would keep one counter open,
        // so the move passes every structural check. Only the score rejects it.
        { staffId: "s-v2", serviceId: "visa" },
        { staffId: "s-v2", serviceId: "passport" },
      ],
      horizonMinutes,
      pressuredServiceId: "passport",
    });

    expect(recommendation).toBeNull();
  });

  it("accepts the same shape of move when the destination gain genuinely wins", () => {
    // Mirror image: the source has plenty of slack, the destination is starved.
    const starvedPassport: FacilityServiceState = {
      ...passport,
      queueLength: 60,
      averageServiceMinutes: 4,
      arrivalRatePerMinute: 0.5,
    };
    const slackVisa: FacilityServiceState = {
      ...visa,
      queueLength: 1,
      arrivalRatePerMinute: 0.05,
      averageServiceMinutes: 2,
    };

    const recommendation = recommendIntervention({
      services: [starvedPassport, slackVisa],
      counters: [
        {
          counterId: "c-p1",
          status: "active",
          serviceId: "passport",
          staffId: "s-p1",
        },
        { counterId: "c-v1", status: "active", serviceId: "visa", staffId: "s-v1" },
        { counterId: "c-v2", status: "active", serviceId: "visa", staffId: "s-v2" },
      ],
      staff: [
        {
          staffId: "s-p1",
          availability: "active",
          currentServiceId: "passport",
          currentCounterId: "c-p1",
        },
        {
          staffId: "s-v1",
          availability: "active",
          currentServiceId: "visa",
          currentCounterId: "c-v1",
        },
        {
          staffId: "s-v2",
          availability: "active",
          currentServiceId: "visa",
          currentCounterId: "c-v2",
        },
      ],
      staffSkills: [
        { staffId: "s-p1", serviceId: "passport" },
        { staffId: "s-v1", serviceId: "visa" },
        { staffId: "s-v2", serviceId: "visa" },
        { staffId: "s-v2", serviceId: "passport" },
      ],
      horizonMinutes,
      pressuredServiceId: "passport",
    });

    expect(recommendation).not.toBeNull();
    expect(recommendation!.actionType).toBe("reassign_staff");
    const payload = recommendation!.actionPayload as ReassignStaffPayload;
    expect(payload.staffId).toBe("s-v2");
    expect(payload.fromServiceId).toBe("visa");
    expect(payload.toServiceId).toBe("passport");
    expect(recommendation!.estimatedMinutesReturned).toBeGreaterThan(0);
  });
});
