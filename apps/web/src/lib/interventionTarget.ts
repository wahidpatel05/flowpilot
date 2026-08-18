import type { ActionType, InterventionStatus } from "./core";

/**
 * Structural mirror of `public.interventions`. The lifecycle timestamps are
 * optional because the Desk selects a narrower set of columns than Control
 * does — the Desk only needs to know an Assignment is incoming, while Control
 * renders when each hop actually happened.
 */
export interface InterventionRow {
  id: string;
  status: InterventionStatus;
  action_type: ActionType;
  action_payload: Record<string, unknown>;
  estimated_minutes_returned: number | null;
  created_at: string;
  approved_at?: string | null;
  accepted_at?: string | null;
  applied_at?: string | null;
}

/**
 * Statuses where the Desk still owes the Staff member a consent step, or
 * still owes them the resulting capacity change. `accepted` stays in this set
 * — not just `approved`/`pending_staff` — because `acceptIncomingAssignment`
 * calls `accept_intervention()` and `apply_intervention()` back to back, and
 * if the connection drops (or a guard raises) between the two, the row is
 * left at `accepted` with capacity not yet changed. Dropping it from this set
 * the moment it reaches `accepted` would strand it: the card would vanish and
 * the Desk would have no way to retry the apply.
 */
export const INCOMING_STATUSES: readonly InterventionStatus[] = [
  "approved",
  "pending_staff",
  "accepted",
];

function readStringField(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

function payloadCounterId(row: InterventionRow): string | undefined {
  return readStringField(row.action_payload, "counterId");
}

/**
 * The Intervention this Counter should surface as an incoming Assignment, if
 * any — the one DeQueue is not allowed to apply without this Staff member's
 * consent. Picks the most recently created match; there should only ever be
 * one live at a time, but this stays well-defined if that invariant slips.
 */
export function findIncomingAssignment(
  interventions: readonly InterventionRow[],
  counterId: string,
): InterventionRow | null {
  const matches = interventions.filter(
    (row) => INCOMING_STATUSES.includes(row.status) && payloadCounterId(row) === counterId,
  );
  if (matches.length === 0) return null;
  return matches.reduce((latest, row) =>
    Date.parse(row.created_at) > Date.parse(latest.created_at) ? row : latest,
  );
}

/**
 * Which Service this Assignment moves the Counter to. `activate_counter`
 * carries `serviceId`; `reassign_staff` carries `toServiceId` — see
 * `ActivateCounterPayload` / `ReassignStaffPayload` in types.ts.
 */
export function destinationServiceId(row: InterventionRow): string | undefined {
  const key = row.action_type === "activate_counter" ? "serviceId" : "toServiceId";
  return readStringField(row.action_payload, key);
}

/** Falls back to 30, the engine's own default `durationMinutes`. */
export function assignmentDurationMinutes(row: InterventionRow): number {
  const value = row.action_payload["durationMinutes"];
  return typeof value === "number" && Number.isFinite(value) ? value : 30;
}
