/**
 * The improvement-moment decision: given the previous and next Live Token
 * model, should the celebration fire? Pure and tiny on purpose — the
 * animation, banner and haptic are all driven off this one true/false.
 */
import { describe, expect, it } from "vitest";
import { didEtaImprove } from "../src/token/improvementMoment";
import type { LiveTokenModel } from "../src/token/tokenPresentation";

type ModelInput = Pick<LiveTokenModel, "status" | "etaMinutes">;

function waiting(etaMinutes: number | null): ModelInput {
  return { status: "waiting", etaMinutes };
}

function called(): ModelInput {
  return { status: "called", etaMinutes: null };
}

describe("didEtaImprove", () => {
  it("never celebrates with no previous value to compare against", () => {
    expect(didEtaImprove(null, waiting(12))).toBe(false);
  });

  it("celebrates a strictly lower ETA", () => {
    expect(didEtaImprove(waiting(20), waiting(12))).toBe(true);
  });

  it("does not celebrate an unchanged ETA", () => {
    expect(didEtaImprove(waiting(12), waiting(12))).toBe(false);
  });

  it("does not celebrate a worsening ETA", () => {
    expect(didEtaImprove(waiting(12), waiting(15))).toBe(false);
  });

  it("celebrates a Counter opening for a previously Closed Service", () => {
    expect(didEtaImprove(waiting(null), waiting(10))).toBe(true);
  });

  it("does not celebrate a Service that just closed", () => {
    expect(didEtaImprove(waiting(10), waiting(null))).toBe(false);
  });

  it("does not celebrate two Closed readings in a row", () => {
    expect(didEtaImprove(waiting(null), waiting(null))).toBe(false);
  });

  it("does not celebrate leaving the waiting state, even to called", () => {
    expect(didEtaImprove(waiting(12), called())).toBe(false);
  });

  it("does not celebrate re-entering waiting from another status", () => {
    expect(didEtaImprove(called(), waiting(5))).toBe(false);
  });
});
