/**
 * The catalogue's reads: every Service, and enough demand and capacity to
 * derive each one's Health.
 *
 * Narrow on purpose. It does not need staff, skills or the Flow Graph, which
 * belong to Control's forecast. Selecting only what is rendered keeps the
 * payload small on hackathon wifi and keeps the app honestly scoped to
 * FlowPilot Visitor.
 *
 * These rows are never interpreted here — they go straight to projectFacility.
 *
 * Takes its client rather than importing one, so the same query can be run from
 * Node against the live project without dragging in React Native's polyfills.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVE_ASSIGNMENT_STATUS, QUEUEING_TOKEN_STATUSES } from "@flowpilot/core";
import type {
  CounterAssignmentRow,
  FacilityRows,
  ServiceRow,
  TokenRow,
} from "@flowpilot/core";
import {
  ASSIGNMENT_COLUMNS,
  COMPLETED_TOKEN_LIMIT,
  MAX_ROWS,
  SERVICE_COLUMNS,
  TOKEN_COLUMNS,
} from "./rows";

export async function fetchFacilityRows(
  client: SupabaseClient,
): Promise<FacilityRows> {
  const [services, counterAssignments, queueing, completed] = await Promise.all([
    client.from("services").select(SERVICE_COLUMNS).order("name").limit(MAX_ROWS),
    client
      .from("counter_assignments")
      .select(ASSIGNMENT_COLUMNS)
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
