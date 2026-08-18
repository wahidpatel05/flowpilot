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
import type {
  CounterAssignmentRow,
  FacilityRows,
  ServiceRow,
  TokenRow,
} from "@flowpilot/core";

/**
 * Tokens that have left do not affect queue length, but `completed` ones carry
 * the measured service durations the engine blends into its average, so they are
 * fetched and left for projectFacility to sort out.
 */
const QUEUE_RELEVANT_TOKEN_STATUSES = ["waiting", "called", "completed"];

export async function fetchFacilityRows(
  client: SupabaseClient,
): Promise<FacilityRows> {
  const [services, counterAssignments, tokens] = await Promise.all([
    client
      .from("services")
      .select(
        "id, name, slug, default_service_minutes, healthy_wait_threshold, critical_wait_threshold",
      )
      .order("name"),
    client
      .from("counter_assignments")
      .select("id, counter_id, staff_id, service_id, assignment_type, status")
      .eq("status", "active"),
    client
      .from("tokens")
      .select(
        "id, service_id, token_number, status, priority, joined_at, called_at, service_started_at, completed_at, is_simulated",
      )
      .in("status", QUEUE_RELEVANT_TOKEN_STATUSES),
  ]);

  // Surface PostgREST's own message: it names the table and the policy, which is
  // the difference between a two-minute fix and an hour of guessing.
  const failure = services.error ?? counterAssignments.error ?? tokens.error;
  if (failure) {
    throw new Error(`Could not read the facility: ${failure.message}`);
  }

  return {
    services: (services.data ?? []) as ServiceRow[],
    counterAssignments: (counterAssignments.data ?? []) as CounterAssignmentRow[],
    tokens: (tokens.data ?? []) as TokenRow[],
  };
}
