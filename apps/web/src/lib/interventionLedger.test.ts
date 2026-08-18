import { describe, expect, it } from "vitest";
import { formatMinutesReturned, type InterventionStatus } from "./core";
import { buildInterventionLedger } from "./interventionLedger";
import type { InterventionRow } from "./interventionTarget";

function intervention(
  id: string,
  status: InterventionStatus,
  estimatedMinutesReturned: number | null,
  createdAt = "2026-08-18T10:00:00.000+00:00",
): InterventionRow {
  return {
    id,
    status,
    action_type: "activate_counter",
    action_payload: { counterId: "c4", staffId: "s7", serviceId: "svc-fees" },
    estimated_minutes_returned: estimatedMinutesReturned,
    created_at: createdAt,
  };
}

describe("buildInterventionLedger — cumulative Estimated Time Returned", () => {
  it("is zero with nothing applied", () => {
    const ledger = buildInterventionLedger([]);
    expect(ledger.cumulativeMinutesReturned).toBe(0);
    expect(ledger.realisedCount).toBe(0);
    expect(formatMinutesReturned(ledger.cumulativeMinutesReturned)).toBe("0 min");
  });

  it("counts up across applied Interventions", () => {
    const ledger = buildInterventionLedger([
      intervention("i1", "applied", 18),
      intervention("i2", "applied", 24),
    ]);
    expect(ledger.cumulativeMinutesReturned).toBe(42);
    expect(ledger.realisedCount).toBe(2);
  });

  it("keeps counting a completed Intervention — expiring does not un-return the time", () => {
    const ledger = buildInterventionLedger([
      intervention("i1", "completed", 30),
      intervention("i2", "applied", 12),
    ]);
    expect(ledger.cumulativeMinutesReturned).toBe(42);
    expect(ledger.realisedCount).toBe(2);
  });

  it("ignores Interventions that never changed capacity", () => {
    const ledger = buildInterventionLedger([
      intervention("i1", "applied", 20),
      intervention("i2", "approved", 500),
      intervention("i3", "accepted", 500),
      intervention("i4", "rejected", 500),
      intervention("i5", "recommended", 500),
    ]);
    expect(ledger.cumulativeMinutesReturned).toBe(20);
    expect(ledger.realisedCount).toBe(1);
  });

  it("treats a null estimate as nothing returned rather than NaN", () => {
    const ledger = buildInterventionLedger([
      intervention("i1", "applied", null),
      intervention("i2", "applied", 15),
    ]);
    expect(ledger.cumulativeMinutesReturned).toBe(15);
  });

  it("formats minutes under an hour, hours and minutes above", () => {
    const under = buildInterventionLedger([intervention("i1", "applied", 42)]);
    expect(formatMinutesReturned(under.cumulativeMinutesReturned)).toBe("42 min");

    const over = buildInterventionLedger([
      intervention("i1", "applied", 200),
      intervention("i2", "applied", 46),
    ]);
    expect(formatMinutesReturned(over.cumulativeMinutesReturned)).toBe("4h 06m");
  });
});

describe("buildInterventionLedger — the Intervention Apply acts on", () => {
  it("is null when nothing is awaiting Apply", () => {
    expect(
      buildInterventionLedger([
        intervention("i1", "applied", 10),
        intervention("i2", "rejected", 10),
        intervention("i3", "recommended", 10),
      ]).awaitingApply,
    ).toBeNull();
  });

  it.each<InterventionStatus>(["approved", "pending_staff", "accepted"])(
    "picks up an Intervention sitting at %s",
    (status) => {
      expect(
        buildInterventionLedger([intervention("i1", status, 10)]).awaitingApply?.id,
      ).toBe("i1");
    },
  );

  it("picks the most recently created when more than one is live", () => {
    const ledger = buildInterventionLedger([
      intervention("older", "approved", 10, "2026-08-18T10:00:00.000+00:00"),
      intervention("newer", "accepted", 10, "2026-08-18T10:05:00.000+00:00"),
    ]);
    expect(ledger.awaitingApply?.id).toBe("newer");
  });

  it("stops offering Apply once the Intervention is applied", () => {
    const ledger = buildInterventionLedger([intervention("i1", "applied", 10)]);
    expect(ledger.awaitingApply).toBeNull();
    expect(ledger.cumulativeMinutesReturned).toBe(10);
  });
});
