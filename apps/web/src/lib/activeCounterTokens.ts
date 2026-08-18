/**
 * Which Token this Counter has called, and which one it is serving, chosen from
 * the rows the Desk reads off `tokens`.
 *
 * Pure, so the choice is testable without a browser: `useActiveCounterTokens`
 * does the I/O and the subscribing, and this decides. `projectFacility` cannot
 * answer it — it deliberately drops `serving` Tokens from `ProjectedService.queue`
 * (they have left the queue) and carries no `called_at`/`service_started_at` for
 * the Now Serving clock.
 */
import type { TokenStatus } from "./core";

/** Structural mirror of the columns the Desk selects from `public.tokens`. */
export interface ActiveTokenRow {
  id: string;
  token_number: string | null;
  /** The engine's own union — never a bare string (INTEGRATION.md rule 2). */
  status: TokenStatus;
  called_at: string | null;
  service_started_at: string | null;
  is_simulated: boolean | null;
}

export interface ActiveToken {
  id: string;
  tokenNumber: string;
  /** `called_at` for a called Token, `service_started_at` for a serving one. */
  startedAtMillis: number;
  /**
   * TRUE for a Token `simulate_rush()` injected. Carried all the way to Now
   * Serving because a simulated Visitor must be visibly marked on every surface
   * that shows one — the Desk calls rush Tokens during the demo, and a bare
   * number at the top of the screen would read as a real person waiting.
   */
  isSimulated: boolean;
}

export interface ActiveTokenSelection {
  calledToken: ActiveToken | null;
  servingToken: ActiveToken | null;
}

/**
 * When this Token reached its current status: `called_at` for a called one,
 * `service_started_at` for a serving one.
 *
 * The status-to-column pairing is decided here and nowhere else, so ordering by
 * it and displaying it cannot disagree. Falls back to `nowMillis` rather than
 * `NaN`, which would render as an "Invalid Date" elapsed clock and sort at
 * random.
 */
function activeSince(row: ActiveTokenRow, nowMillis: number): number {
  const raw = row.status === "called" ? row.called_at : row.service_started_at;
  if (raw === null) return nowMillis;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : nowMillis;
}

function toActiveToken(row: ActiveTokenRow, nowMillis: number): ActiveToken {
  return {
    id: row.id,
    tokenNumber: row.token_number ?? "",
    startedAtMillis: activeSince(row, nowMillis),
    // A null `is_simulated` is a real Visitor: never label someone simulated on
    // a missing column.
    isSimulated: row.is_simulated === true,
  };
}

/**
 * The latest called Token and the latest serving one.
 *
 * "Latest" because `tokens` has no `counter_id`, only `service_id`, so when a
 * Service runs more than one active Counter this is the most recent called and
 * serving Token for the whole Service rather than certainly the ones at THIS
 * Counter. Acceptable at demo scale (the seeded baseline runs one active Counter
 * per Service); a true per-Counter answer needs a schema change.
 */
export function selectActiveTokens(
  rows: readonly ActiveTokenRow[],
  nowMillis: number,
): ActiveTokenSelection {
  let called: ActiveTokenRow | undefined;
  let serving: ActiveTokenRow | undefined;

  for (const row of rows) {
    if (row.status === "called") {
      if (
        called === undefined ||
        activeSince(row, nowMillis) > activeSince(called, nowMillis)
      ) {
        called = row;
      }
      continue;
    }
    if (row.status === "serving") {
      if (
        serving === undefined ||
        activeSince(row, nowMillis) > activeSince(serving, nowMillis)
      ) {
        serving = row;
      }
    }
  }

  return {
    calledToken: called === undefined ? null : toActiveToken(called, nowMillis),
    servingToken: serving === undefined ? null : toActiveToken(serving, nowMillis),
  };
}
