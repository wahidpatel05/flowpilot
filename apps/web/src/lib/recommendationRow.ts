import type { ActionType, InterventionStatus } from "./core";

/** Structural mirror of `public.recommendations` — the columns Control reads. */
export interface RecommendationRow {
  id: string;
  service_id: string;
  action_type: ActionType;
  action_payload: Record<string, unknown>;
  baseline_wait: number | null;
  predicted_wait: number | null;
  baseline_person_minutes: number | null;
  predicted_person_minutes: number | null;
  estimated_minutes_returned: number | null;
  confidence: "low" | "medium" | "high" | null;
  status: InterventionStatus;
  created_at: string;
}

/** The one status a Recommendation sits in before a Manager acts on it. */
export const ACTIVE_RECOMMENDATION_STATUS: InterventionStatus = "recommended";

function readString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

function readNumber(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export interface RecommendationParties {
  staffId: string | undefined;
  counterId: string | undefined;
  /** Undefined for `activate_counter` — there is no "from" Service. */
  fromServiceId: string | undefined;
  toServiceId: string | undefined;
  durationMinutes: number;
}

/** Falls back to 30, the engine's own default `durationMinutes`. */
const DEFAULT_DURATION_MINUTES = 30;

/**
 * Normalizes `activate_counter`'s and `reassign_staff`'s differently-shaped
 * payloads into one set of named parties to render — see `ActivateCounterPayload`
 * / `ReassignStaffPayload` in flowpilot-core/src/types.ts. Never reads a third
 * action type: `reassign_counter` does not exist (ADR-0001).
 */
export function recommendationParties(row: RecommendationRow): RecommendationParties {
  const payload = row.action_payload;
  const durationMinutes = readNumber(payload, "durationMinutes") ?? DEFAULT_DURATION_MINUTES;

  if (row.action_type === "activate_counter") {
    return {
      staffId: readString(payload, "staffId"),
      counterId: readString(payload, "counterId"),
      fromServiceId: undefined,
      toServiceId: readString(payload, "serviceId") ?? row.service_id,
      durationMinutes,
    };
  }

  return {
    staffId: readString(payload, "staffId"),
    counterId: readString(payload, "counterId"),
    fromServiceId: readString(payload, "fromServiceId"),
    toServiceId: readString(payload, "toServiceId") ?? row.service_id,
    durationMinutes,
  };
}
