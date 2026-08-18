/**
 * The Visitor's reads.
 *
 * Narrow on purpose. The catalogue needs demand (tokens), capacity (active
 * counter_assignments) and the Service catalogue itself; it does not need
 * staff, skills or the Flow Graph, which belong to Control's forecast. Selecting
 * only what is rendered keeps the payload small on hackathon wifi and keeps the
 * app honestly scoped to FlowPilot Visitor.
 *
 * These rows are never interpreted here — they go straight to projectFacility.
 *
 * Takes its client rather than importing one, so the same query can be run from
 * Node against the live project without dragging in React Native's polyfills.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACTIVE_ASSIGNMENT_STATUS,
  MAX_RECENT_DURATION_SAMPLES,
  QUEUEING_TOKEN_STATUSES,
} from "@flowpilot/core";
import type {
  CounterAssignmentRow,
  FacilityRows,
  ServiceRow,
  TokenRow,
} from "@flowpilot/core";

/**
 * PostgREST applies its own row cap when a query names none, which would
 * silently understate queue length. Stated explicitly, matching scripts/src/client.ts.
 */
const MAX_ROWS = 5000;

/**
 * Completed Tokens are fetched only for the service durations the engine blends
 * into its average, and it keeps just the newest MAX_RECENT_DURATION_SAMPLES per
 * Service — so this asks for the most recent completions rather than every
 * Token ever closed. Sized for several Services' worth of that window; the
 * ordering is global, so a very busy Service can crowd out a quiet one's samples,
 * which costs the quiet one nothing worse than its configured cold-start default.
 */
const COMPLETED_TOKEN_LIMIT = MAX_RECENT_DURATION_SAMPLES * 10;

const TOKEN_COLUMNS =
  "id, service_id, token_number, status, priority, joined_at, called_at, service_started_at, completed_at, is_simulated";

export async function fetchFacilityRows(
  client: SupabaseClient,
): Promise<FacilityRows> {
  const [services, counterAssignments, queueing, completed] = await Promise.all([
    client
      .from("services")
      .select(
        "id, name, slug, default_service_minutes, healthy_wait_threshold, critical_wait_threshold",
      )
      .order("name")
      .limit(MAX_ROWS),
    client
      .from("counter_assignments")
      .select("id, counter_id, staff_id, service_id, assignment_type, status")
      .eq("status", ACTIVE_ASSIGNMENT_STATUS)
      .limit(MAX_ROWS),
    client
      .from("tokens")
      .select(TOKEN_COLUMNS)
      .in("status", QUEUEING_TOKEN_STATUSES)
      .limit(MAX_ROWS),
    client
      .from("tokens")
      .select(TOKEN_COLUMNS)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(COMPLETED_TOKEN_LIMIT),
  ]);

  // Surface PostgREST's own message: it names the table and the policy, which is
  // the difference between a two-minute fix and an hour of guessing.
  const failure =
    services.error ?? counterAssignments.error ?? queueing.error ?? completed.error;
  if (failure) {
    throw new Error(`Could not read the facility: ${failure.message}`);
  }

  return {
    services: (services.data ?? []) as ServiceRow[],
    counterAssignments: (counterAssignments.data ?? []) as CounterAssignmentRow[],
    // projectFacility sorts queueing from completed itself; it only needs both.
    tokens: [
      ...((queueing.data ?? []) as TokenRow[]),
      ...((completed.data ?? []) as TokenRow[]),
    ],
  };
}
