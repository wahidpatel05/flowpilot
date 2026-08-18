/**
 * What Control reads off the `interventions` table: the running Estimated Time
 * Returned, and the one Intervention the Apply button acts on.
 *
 * ESTIMATED, NEVER MEASURED (ADR-0002). Every number here is the simulator's
 * counterfactual, carried over from the originating Recommendation at approval
 * time. No one observes the facility that didn't happen.
 */
import { sumMinutesReturned, type InterventionStatus } from "./core";
import type { InterventionRow } from "./interventionTarget";

/**
 * The statuses where capacity has actually changed, so the estimate belongs in
 * the running total. Mirrors `interventions.estimated_minutes_returned`'s own
 * column comment in 0001_init.sql: "Cumulative session total = sum over
 * interventions where status in (applied, completed)". `completed` counts
 * because a temporary Assignment expiring does not un-return the time it
 * already returned.
 */
export const REALISED_STATUSES: readonly InterventionStatus[] = [
  "applied",
  "completed",
];

/**
 * The statuses where the world has been authorised to change but hasn't yet —
 * the ones Apply is for. `apply_intervention()` accepts `approved` or
 * `accepted`; `pending_staff` sits between them and is included so an
 * Intervention parked there is never stranded off Control's Apply card.
 */
export const AWAITING_APPLY_STATUSES: readonly InterventionStatus[] = [
  "approved",
  "pending_staff",
  "accepted",
];

export interface InterventionLedger {
  /** Cumulative person-minutes across every realised Intervention. */
  cumulativeMinutesReturned: number;
  /** How many Interventions that total is made of. */
  realisedCount: number;
  /**
   * The Intervention Control's Apply button acts on, or null. The most recently
   * created one awaiting Apply — there should only ever be one live at a time,
   * but this stays well-defined if that invariant slips.
   */
  awaitingApply: InterventionRow | null;
}

function createdAtMillis(row: InterventionRow): number {
  const parsed = Date.parse(row.created_at);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildInterventionLedger(
  rows: readonly InterventionRow[],
): InterventionLedger {
  const realised = rows.filter((row) => REALISED_STATUSES.includes(row.status));
  const pending = rows.filter((row) => AWAITING_APPLY_STATUSES.includes(row.status));

  return {
    // sumMinutesReturned is the engine's own accumulator: it ignores nulls,
    // negatives and non-finite values rather than propagating them into the
    // one figure the Manager is here to watch.
    cumulativeMinutesReturned: sumMinutesReturned(
      realised.map((row) => row.estimated_minutes_returned ?? 0),
    ),
    realisedCount: realised.length,
    awaitingApply:
      pending.length === 0
        ? null
        : pending.reduce((latest, row) =>
            createdAtMillis(row) > createdAtMillis(latest) ? row : latest,
          ),
  };
}
