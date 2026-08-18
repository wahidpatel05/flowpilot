/**
 * The column lists and row caps every facility read shares — the catalogue's
 * full-facility fetch and the Live Token screen's single-Service fetch alike.
 * One definition, so the two can't quietly drift into asking for different
 * shapes of the same tables.
 */
import { MAX_RECENT_DURATION_SAMPLES } from "@flowpilot/core";

/**
 * PostgREST applies its own row cap when a query names none, which would
 * silently understate a result. Stated explicitly, matching scripts/src/client.ts.
 */
export const MAX_ROWS = 5000;

/**
 * Completed Tokens are fetched only for the service durations the engine
 * blends into its average, and it keeps just the newest
 * MAX_RECENT_DURATION_SAMPLES — so this asks for the most recent completions
 * rather than every Token ever closed.
 */
export const COMPLETED_TOKEN_LIMIT = MAX_RECENT_DURATION_SAMPLES * 10;

export const SERVICE_COLUMNS =
  "id, name, slug, default_service_minutes, healthy_wait_threshold, critical_wait_threshold";

export const ASSIGNMENT_COLUMNS =
  "id, counter_id, staff_id, service_id, assignment_type, status";

export const TOKEN_COLUMNS =
  "id, service_id, token_number, status, priority, joined_at, called_at, service_started_at, completed_at, is_simulated";
