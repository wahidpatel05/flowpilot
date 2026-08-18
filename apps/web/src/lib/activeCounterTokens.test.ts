import { describe, expect, it } from "vitest";
import { selectActiveTokens } from "./activeCounterTokens";
import type { ActiveTokenRow } from "./activeCounterTokens";

const NOW = Date.parse("2026-08-18T09:00:00.000Z");

function row(overrides: Partial<ActiveTokenRow>): ActiveTokenRow {
  return {
    id: "token-1",
    token_number: "E-101",
    status: "waiting",
    called_at: null,
    service_started_at: null,
    is_simulated: false,
    ...overrides,
  };
}

describe("selectActiveTokens", () => {
  it("reports nothing at an idle Counter", () => {
    expect(selectActiveTokens([], NOW)).toEqual({
      calledToken: null,
      servingToken: null,
    });
  });

  it("ignores Tokens that are neither called nor serving", () => {
    const rows = [
      row({ id: "a", status: "waiting" }),
      row({ id: "b", status: "completed" }),
    ];
    expect(selectActiveTokens(rows, NOW)).toEqual({
      calledToken: null,
      servingToken: null,
    });
  });

  it("takes the most recently called Token when several are called", () => {
    const rows = [
      row({
        id: "older",
        token_number: "E-101",
        status: "called",
        called_at: "2026-08-18T08:58:00.000Z",
      }),
      row({
        id: "newer",
        token_number: "E-102",
        status: "called",
        called_at: "2026-08-18T08:59:30.000Z",
      }),
    ];
    const { calledToken } = selectActiveTokens(rows, NOW);
    expect(calledToken?.id).toBe("newer");
    expect(calledToken?.tokenNumber).toBe("E-102");
    expect(calledToken?.startedAtMillis).toBe(Date.parse("2026-08-18T08:59:30.000Z"));
  });

  it("takes the most recently started serving Token when several are serving", () => {
    const rows = [
      row({
        id: "older",
        status: "serving",
        service_started_at: "2026-08-18T08:50:00.000Z",
      }),
      row({
        id: "newer",
        status: "serving",
        service_started_at: "2026-08-18T08:57:00.000Z",
      }),
    ];
    const { servingToken } = selectActiveTokens(rows, NOW);
    expect(servingToken?.id).toBe("newer");
    expect(servingToken?.startedAtMillis).toBe(Date.parse("2026-08-18T08:57:00.000Z"));
  });

  it("reports a called and a serving Token independently", () => {
    const rows = [
      row({ id: "called", status: "called", called_at: "2026-08-18T08:59:00.000Z" }),
      row({
        id: "serving",
        status: "serving",
        service_started_at: "2026-08-18T08:55:00.000Z",
      }),
    ];
    const selection = selectActiveTokens(rows, NOW);
    expect(selection.calledToken?.id).toBe("called");
    expect(selection.servingToken?.id).toBe("serving");
  });

  it("marks a Token Simulate Rush injected as simulated", () => {
    const rows = [
      row({
        id: "sim",
        status: "serving",
        service_started_at: "2026-08-18T08:55:00.000Z",
        is_simulated: true,
      }),
    ];
    expect(selectActiveTokens(rows, NOW).servingToken?.isSimulated).toBe(true);
  });

  it("treats a missing is_simulated as a real Visitor rather than guessing", () => {
    const rows = [
      row({
        id: "real",
        status: "called",
        called_at: "2026-08-18T08:59:00.000Z",
        is_simulated: null,
      }),
    ];
    expect(selectActiveTokens(rows, NOW).calledToken?.isSimulated).toBe(false);
  });

  it("falls back to now when the row carries no timestamp, rather than NaN", () => {
    const rows = [row({ id: "no-clock", status: "serving", service_started_at: null })];
    expect(selectActiveTokens(rows, NOW).servingToken?.startedAtMillis).toBe(NOW);
  });

  it("falls back to now when the timestamp is unparseable", () => {
    const rows = [row({ id: "bad-clock", status: "called", called_at: "not a date" })];
    expect(selectActiveTokens(rows, NOW).calledToken?.startedAtMillis).toBe(NOW);
  });

  it("renders an empty Token number rather than 'null' when the row has none", () => {
    const rows = [
      row({
        id: "nameless",
        token_number: null,
        status: "called",
        called_at: "2026-08-18T08:59:00.000Z",
      }),
    ];
    expect(selectActiveTokens(rows, NOW).calledToken?.tokenNumber).toBe("");
  });
});
