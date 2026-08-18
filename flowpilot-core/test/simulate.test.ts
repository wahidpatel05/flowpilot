import { describe, expect, it } from "vitest";
import { simulateFacility } from "../src/simulation/simulate.js";
import type { FacilityServiceState } from "../src/types.js";

function service(
  overrides: Partial<FacilityServiceState> & { serviceId: string },
): FacilityServiceState {
  return {
    queueLength: 0,
    activeCounters: 1,
    averageServiceMinutes: 5,
    arrivalRatePerMinute: 0,
    ...overrides,
  };
}

describe("simulateFacility", () => {
  it("never lets a queue go negative", () => {
    const result = simulateFacility({
      services: [
        service({
          serviceId: "info",
          queueLength: 3,
          activeCounters: 4,
          averageServiceMinutes: 1,
          arrivalRatePerMinute: 0,
        }),
      ],
      horizonMinutes: 30,
    });

    const info = result.services[0];
    expect(info).toBeDefined();
    for (const value of info!.queueLengthByMinute) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(info!.finalQueueLength).toBe(0);
  });

  it("drains to zero when capacity exceeds arrivals", () => {
    const result = simulateFacility({
      services: [
        service({
          serviceId: "billing",
          queueLength: 10,
          activeCounters: 2,
          averageServiceMinutes: 2, // capacity 1.0/min
          arrivalRatePerMinute: 0.2,
        }),
      ],
      horizonMinutes: 60,
    });

    const billing = result.services[0];
    expect(billing!.finalQueueLength).toBe(0);
    expect(billing!.finalWaitMinutes).toBe(0);
    expect(billing!.health).toBe("healthy");
    expect(billing!.peakQueueLength).toBe(10);
  });

  it("grows monotonically when arrivals exceed capacity", () => {
    const result = simulateFacility({
      services: [
        service({
          serviceId: "visa",
          queueLength: 8,
          activeCounters: 1,
          averageServiceMinutes: 10, // capacity 0.1/min
          arrivalRatePerMinute: 0.6,
          downstreamArrivalRatePerMinute: 0.2, // arrivals 0.8/min
        }),
      ],
      horizonMinutes: 45,
    });

    const visa = result.services[0]!;
    const series = visa.queueLengthByMinute;
    expect(series).toHaveLength(46);
    for (let index = 1; index < series.length; index += 1) {
      expect(series[index]!).toBeGreaterThan(series[index - 1]!);
    }
    // net = 0.8 - 0.1 = 0.7 per minute
    expect(visa.finalQueueLength).toBeCloseTo(8 + 0.7 * 45, 6);
    expect(visa.peakQueueLength).toBe(visa.finalQueueLength);
    expect(visa.finalWaitMinutes).toBeCloseTo(visa.finalQueueLength / 0.1, 6);
    expect(visa.health).toBe("critical");
  });

  it("treats a fully closed service as an unbounded wait", () => {
    const result = simulateFacility({
      services: [
        service({ serviceId: "closed", queueLength: 5, activeCounters: 0 }),
      ],
      horizonMinutes: 10,
    });
    expect(result.services[0]!.finalWaitMinutes).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(result.services[0]!.finalQueueLength).toBe(5);
  });

  it("reports personMinutesWaiting as the sum of queue length over minutes", () => {
    const result = simulateFacility({
      services: [
        service({
          serviceId: "billing",
          queueLength: 6,
          activeCounters: 1,
          averageServiceMinutes: 4, // capacity 0.25/min
          arrivalRatePerMinute: 0.75, // net +0.5/min
        }),
        service({
          serviceId: "info",
          queueLength: 4,
          activeCounters: 2,
          averageServiceMinutes: 2, // capacity 1.0/min
          arrivalRatePerMinute: 0.5,
        }),
      ],
      horizonMinutes: 20,
    });

    let facilityTotal = 0;
    for (const entry of result.services) {
      const expected = entry.queueLengthByMinute
        .slice(0, result.horizonMinutes)
        .reduce((sum, value) => sum + value, 0);
      expect(entry.personMinutesWaiting).toBeCloseTo(expected, 6);
      facilityTotal += entry.personMinutesWaiting;
    }
    expect(result.totalPersonMinutesWaiting).toBeCloseTo(facilityTotal, 6);
  });

  it("is deterministic and fast", () => {
    const services = Array.from({ length: 5 }, (_unused, index) =>
      service({
        serviceId: `svc-${index}`,
        queueLength: 10 + index,
        activeCounters: 1 + (index % 3),
        averageServiceMinutes: 3 + index,
        arrivalRatePerMinute: 0.4 + index * 0.1,
      }),
    );

    const first = simulateFacility({ services, horizonMinutes: 60 });
    const second = simulateFacility({ services, horizonMinutes: 60 });
    expect(second).toEqual(first);

    const iterations = 200;
    const started = performance.now();
    for (let index = 0; index < iterations; index += 1) {
      simulateFacility({ services, horizonMinutes: 60 });
    }
    const perRunMs = (performance.now() - started) / iterations;
    expect(perRunMs).toBeLessThan(1);
  });
});

describe("simulateFacility — Health bands honour each Service's own thresholds", () => {
  /**
   * A simulated Health band must agree with the live one for the same wait.
   * Before these thresholds were carried through, simulateFacility always fell
   * back to the engine defaults (10 / 25), so Examination Cell — whose real
   * critical threshold is 30 — could read `busy` now and `critical` in the
   * forecast for one and the same wait value.
   */
  it("uses the Service's own critical threshold instead of the default", () => {
    // 1 counter, 6 min each => capacity 1/6 per min. Queue of 4.5 with no
    // arrivals holds steady, giving a 27 min wait: over the 25 min default,
    // under this Service's configured 30.
    const withOwnThresholds = simulateFacility({
      services: [
        service({
          serviceId: "examination",
          queueLength: 4.5,
          activeCounters: 1,
          averageServiceMinutes: 6,
          healthyThresholdMinutes: 15,
          criticalThresholdMinutes: 30,
        }),
      ],
      horizonMinutes: 0,
    });

    expect(withOwnThresholds.services[0]?.finalWaitMinutes).toBeCloseTo(27, 5);
    expect(withOwnThresholds.services[0]?.health).toBe("busy");
  });

  it("still falls back to the engine defaults when thresholds are absent", () => {
    const withoutThresholds = simulateFacility({
      services: [
        service({
          serviceId: "examination",
          queueLength: 4.5,
          activeCounters: 1,
          averageServiceMinutes: 6,
        }),
      ],
      horizonMinutes: 0,
    });

    // Same 27 min wait, but 27 >= the 25 min default critical threshold.
    expect(withoutThresholds.services[0]?.finalWaitMinutes).toBeCloseTo(27, 5);
    expect(withoutThresholds.services[0]?.health).toBe("critical");
  });

  it("honours a generous healthy threshold", () => {
    const result = simulateFacility({
      services: [
        service({
          serviceId: "documents",
          queueLength: 3,
          activeCounters: 1,
          averageServiceMinutes: 4,
          healthyThresholdMinutes: 15,
          criticalThresholdMinutes: 30,
        }),
      ],
      horizonMinutes: 0,
    });

    // 12 min wait: `busy` under the 10 min default, `healthy` under this
    // Service's own 15 min band.
    expect(result.services[0]?.finalWaitMinutes).toBeCloseTo(12, 5);
    expect(result.services[0]?.health).toBe("healthy");
  });

  it("keeps an unbounded wait critical regardless of thresholds", () => {
    const result = simulateFacility({
      services: [
        service({
          serviceId: "closed",
          queueLength: 5,
          activeCounters: 0,
          healthyThresholdMinutes: 999,
          criticalThresholdMinutes: 9999,
        }),
      ],
      horizonMinutes: 0,
    });

    expect(result.services[0]?.finalWaitMinutes).toBe(Number.POSITIVE_INFINITY);
    expect(result.services[0]?.health).toBe("critical");
  });
});
