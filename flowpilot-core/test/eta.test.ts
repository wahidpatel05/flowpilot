import { describe, expect, it } from "vitest";
import {
  buildQueueSnapshot,
  calculateAverageServiceMinutes,
  calculateEta,
  calculateEtaRange,
  calculateQueueHealth,
} from "../src/queue/eta.js";

describe("calculateAverageServiceMinutes", () => {
  it("cold starts on the configured default when there are no samples", () => {
    expect(
      calculateAverageServiceMinutes({
        recentDurationsMinutes: [],
        defaultMinutes: 7,
      }),
    ).toBe(7);
  });

  it("blends the recent average 75/25 against the default", () => {
    // recent average = 10 -> 10 * 0.75 + 6 * 0.25 = 9
    expect(
      calculateAverageServiceMinutes({
        recentDurationsMinutes: [8, 10, 12],
        defaultMinutes: 6,
      }),
    ).toBeCloseTo(9, 10);
  });

  it("uses at most the 30 most recent samples", () => {
    const olderNoise = new Array<number>(20).fill(1000);
    const recent = new Array<number>(30).fill(4);
    const blended = calculateAverageServiceMinutes({
      recentDurationsMinutes: [...olderNoise, ...recent],
      defaultMinutes: 8,
    });
    // 4 * 0.75 + 8 * 0.25 = 5 — the 1000s are outside the window.
    expect(blended).toBeCloseTo(5, 10);
  });
});

describe("calculateEta", () => {
  it("divides remaining work by the number of open counters", () => {
    expect(
      calculateEta({
        customersAhead: 12,
        averageServiceMinutes: 5,
        activeCounters: 3,
      }),
    ).toBe(20);
  });

  it("returns Infinity when no counter is active", () => {
    expect(
      calculateEta({
        customersAhead: 4,
        averageServiceMinutes: 5,
        activeCounters: 0,
      }),
    ).toBe(Number.POSITIVE_INFINITY);
    expect(
      calculateEta({
        customersAhead: 4,
        averageServiceMinutes: 5,
        activeCounters: -2,
      }),
    ).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("calculateEtaRange", () => {
  it("spans plus or minus 15 percent", () => {
    const range = calculateEtaRange(100);
    expect(range.lowerMinutes).toBeCloseTo(85, 10);
    expect(range.upperMinutes).toBeCloseTo(115, 10);
  });

  it("clamps at zero and never goes negative", () => {
    expect(calculateEtaRange(0)).toEqual({ lowerMinutes: 0, upperMinutes: 0 });
    const negative = calculateEtaRange(-50);
    expect(negative.lowerMinutes).toBe(0);
    expect(negative.upperMinutes).toBe(0);
  });

  it("is Infinity-safe", () => {
    expect(calculateEtaRange(Number.POSITIVE_INFINITY)).toEqual({
      lowerMinutes: Number.POSITIVE_INFINITY,
      upperMinutes: Number.POSITIVE_INFINITY,
    });
  });
});

describe("calculateQueueHealth", () => {
  it("classifies against the thresholds", () => {
    const thresholds = { healthyThreshold: 10, criticalThreshold: 25 };
    expect(
      calculateQueueHealth({ predictedWaitMinutes: 4, ...thresholds }),
    ).toBe("healthy");
    expect(
      calculateQueueHealth({ predictedWaitMinutes: 18, ...thresholds }),
    ).toBe("busy");
    expect(
      calculateQueueHealth({ predictedWaitMinutes: 40, ...thresholds }),
    ).toBe("critical");
    expect(
      calculateQueueHealth({
        predictedWaitMinutes: Number.POSITIVE_INFINITY,
        ...thresholds,
      }),
    ).toBe("critical");
  });
});

describe("buildQueueSnapshot", () => {
  it("composes the ETA pipeline into a QueueSnapshot", () => {
    const snapshot = buildQueueSnapshot({
      serviceId: "billing",
      queueLength: 12,
      activeCounters: 2,
      recentDurationsMinutes: [10, 10, 10],
      defaultServiceMinutes: 6,
      healthyThreshold: 10,
      criticalThreshold: 25,
      arrivalRatePerMinute: 0.8,
    });

    expect(snapshot.averageServiceMinutes).toBeCloseTo(9, 10);
    expect(snapshot.predictedWaitMinutes).toBeCloseTo(54, 10);
    expect(snapshot.etaLowerMinutes).toBeCloseTo(45.9, 10);
    expect(snapshot.etaUpperMinutes).toBeCloseTo(62.1, 10);
    expect(snapshot.health).toBe("critical");
    expect(snapshot.arrivalRatePerMinute).toBe(0.8);
  });

  it("reports an unbounded wait when every counter is closed", () => {
    const snapshot = buildQueueSnapshot({
      serviceId: "passport",
      queueLength: 5,
      activeCounters: 0,
      defaultServiceMinutes: 4,
    });
    expect(snapshot.predictedWaitMinutes).toBe(Number.POSITIVE_INFINITY);
    expect(snapshot.etaUpperMinutes).toBe(Number.POSITIVE_INFINITY);
    expect(snapshot.health).toBe("critical");
    expect(snapshot.averageServiceMinutes).toBe(4);
  });
});
