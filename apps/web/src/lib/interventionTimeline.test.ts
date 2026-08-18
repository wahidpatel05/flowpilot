import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  formatTimelineClock,
  timelineMessage,
  type InterventionEventRow,
} from "./interventionTimeline";

const INT_A = "int-a";
const INT_B = "int-b";

/** The transaction instant two events written by one RPC call would share. */
const TX = "2026-08-18T10:00:00.000+00:00";

function event(overrides: Partial<InterventionEventRow>): InterventionEventRow {
  return {
    id: "e1",
    intervention_id: INT_A,
    event_type: "approved",
    message: "Manager approved opening Counter 4 with Priya Sharma for Fees.",
    metadata: {},
    created_at: TX,
    ...overrides,
  };
}

describe("buildTimeline — ordering", () => {
  it("orders chronologically when the timestamps differ", () => {
    const timeline = buildTimeline([
      event({ id: "later", event_type: "applied", created_at: "2026-08-18T10:05:00.000+00:00" }),
      event({ id: "earlier", event_type: "recommendation_created", created_at: "2026-08-18T10:00:00.000+00:00" }),
    ]);
    expect(timeline.map((entry) => entry.id)).toEqual(["earlier", "later"]);
  });

  it("renders approved before applied when both land in the same millisecond", () => {
    // The failure the issue warns about: everything written inside one RPC
    // call ties once Date.parse truncates clock_timestamp() to the millisecond.
    const timeline = buildTimeline([
      event({ id: "applied", event_type: "applied", metadata: { sequence: 6 }, created_at: TX }),
      event({ id: "approved", event_type: "approved", metadata: { sequence: 3 }, created_at: TX }),
      event({ id: "eta", event_type: "eta_recalculated", metadata: { sequence: 7 }, created_at: TX }),
      event({ id: "created", event_type: "recommendation_created", metadata: { sequence: 2 }, created_at: TX }),
      event({ id: "accepted", event_type: "staff_accepted", metadata: { sequence: 5 }, created_at: TX }),
    ]);
    expect(timeline.map((entry) => entry.id)).toEqual([
      "created",
      "approved",
      "accepted",
      "applied",
      "eta",
    ]);
  });

  it("falls back to the canonical lifecycle position when metadata carries no sequence", () => {
    const timeline = buildTimeline([
      event({ id: "applied", event_type: "applied", metadata: {}, created_at: TX }),
      event({ id: "approved", event_type: "approved", metadata: null, created_at: TX }),
    ]);
    expect(timeline.map((entry) => entry.id)).toEqual(["approved", "applied"]);
  });

  it("accepts a sequence that arrives as a string", () => {
    const timeline = buildTimeline([
      event({ id: "applied", event_type: "unknown_later", metadata: { sequence: "6" }, created_at: TX }),
      event({ id: "approved", event_type: "unknown_earlier", metadata: { sequence: "3" }, created_at: TX }),
    ]);
    expect(timeline.map((entry) => entry.id)).toEqual(["approved", "applied"]);
  });

  it("sorts an unrecognised event type late rather than ahead of the lifecycle", () => {
    const timeline = buildTimeline([
      event({ id: "mystery", event_type: "something_new", metadata: {}, created_at: TX }),
      event({ id: "created", event_type: "recommendation_created", metadata: {}, created_at: TX }),
    ]);
    expect(timeline.map((entry) => entry.id)).toEqual(["created", "mystery"]);
  });

  it("breaks a full tie on the sub-millisecond timestamp, then on id", () => {
    const timeline = buildTimeline([
      event({ id: "b", event_type: "applied", created_at: "2026-08-18T10:00:00.000900+00:00" }),
      event({ id: "a", event_type: "applied", created_at: "2026-08-18T10:00:00.000100+00:00" }),
    ]);
    expect(timeline.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("keeps each Intervention's own hops in lifecycle order across two Interventions", () => {
    const timeline = buildTimeline([
      event({ id: "b-approved", intervention_id: INT_B, event_type: "approved", created_at: "2026-08-18T10:10:00.000+00:00" }),
      event({ id: "a-applied", intervention_id: INT_A, event_type: "applied", created_at: "2026-08-18T10:01:00.000+00:00" }),
      event({ id: "a-approved", intervention_id: INT_A, event_type: "approved", created_at: "2026-08-18T10:00:00.000+00:00" }),
    ]);
    expect(timeline.map((entry) => entry.id)).toEqual(["a-approved", "a-applied", "b-approved"]);
  });

  it("does not mutate the rows it was handed", () => {
    const rows = [
      event({ id: "applied", event_type: "applied" }),
      event({ id: "approved", event_type: "approved" }),
    ];
    buildTimeline(rows);
    expect(rows.map((row) => row.id)).toEqual(["applied", "approved"]);
  });
});

describe("buildTimeline — entries", () => {
  it("carries the real timestamp through, never a fabricated one", () => {
    const [entry] = buildTimeline([event({ created_at: "2026-08-18T10:00:00.123456+00:00" })]);
    expect(entry!.at).toBe("2026-08-18T10:00:00.123456+00:00");
    expect(entry!.atMillis).toBe(Date.parse("2026-08-18T10:00:00.123+00:00"));
  });

  it("labels and tones each lifecycle hop", () => {
    const timeline = buildTimeline([
      event({ id: "a", event_type: "approved", created_at: "2026-08-18T10:00:00.000+00:00" }),
      event({ id: "b", event_type: "applied", created_at: "2026-08-18T10:01:00.000+00:00" }),
      event({ id: "c", event_type: "rejected", created_at: "2026-08-18T10:02:00.000+00:00" }),
    ]);
    expect(timeline.map((entry) => [entry.label, entry.tone])).toEqual([
      ["Approved", "accent"],
      ["Applied", "positive"],
      ["Rejected", "critical"],
    ]);
  });

  it("humanises the label of an event type it has never seen", () => {
    const [entry] = buildTimeline([event({ event_type: "queue_drained_early" })]);
    expect(entry!.label).toBe("queue drained early");
  });
});

describe("timelineMessage", () => {
  it("renders the database's own prose", () => {
    expect(
      timelineMessage(
        event({ message: "Counter 4 opened for Fees. Priya Sharma is now serving there." }),
      ),
    ).toBe("Counter 4 opened for Fees. Priya Sharma is now serving there.");
  });

  it("falls back to prose when the row carries no message", () => {
    expect(timelineMessage(event({ event_type: "applied", message: null }))).toBe(
      "Capacity changed — the Assignment moved.",
    );
    expect(timelineMessage(event({ event_type: "applied", message: "   " }))).toBe(
      "Capacity changed — the Assignment moved.",
    );
  });

  it("refuses a message containing a raw identifier and reads prose instead", () => {
    const leaked = timelineMessage(
      event({
        event_type: "approved",
        message: "Manager approved 8f14e45f-ceea-467a-9dfd-1d0c2fa4b0c3.",
      }),
    );
    expect(leaked).toBe("The manager approved this Intervention.");
    expect(leaked).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it("still says something for an event type it has never seen", () => {
    expect(timelineMessage(event({ event_type: "queue_drained_early", message: null }))).toBe(
      "DeQueue recorded a step in this Intervention.",
    );
  });
});

describe("formatTimelineClock", () => {
  it("renders the wall clock of the real instant", () => {
    const at = new Date("2026-08-18T10:07:05.000Z");
    const pad = (value: number) => String(value).padStart(2, "0");
    expect(formatTimelineClock(at.getTime())).toBe(
      `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`,
    );
  });

  it("renders an em dash rather than an invented time for an unparseable instant", () => {
    expect(formatTimelineClock(Number.NaN)).toBe("—");
  });
});
