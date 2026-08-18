/**
 * The Live Token screen's reads: one Service's row, its active capacity, and
 * its queue — everything projectFacility needs to compute one Visitor's ETA,
 * and nothing about any other Service.
 *
 * A single-Service FacilityRows still runs through projectFacility rather than
 * a bespoke position/ETA calculation here — the engine's per-Service logic
 * needs no other Service's data to be correct (only the Flow Graph's
 * downstream-pressure hop does, and that has no bearing on this Visitor's own
 * ETA), so scoping the rows is free.
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

export async function fetchServiceQueueRows(
  client: SupabaseClient,
  serviceId: string,
): Promise<FacilityRows> {
  const [service, counterAssignments, queueing, completed] = await Promise.all([
    client.from("services").select(SERVICE_COLUMNS).eq("id", serviceId).single(),
    client
      .from("counter_assignments")
      .select(ASSIGNMENT_COLUMNS)
      .eq("service_id", serviceId)
      .eq("status", ACTIVE_ASSIGNMENT_STATUS)
      .limit(MAX_ROWS),
    client
      .from("tokens")
      .select(TOKEN_COLUMNS)
      .eq("service_id", serviceId)
      .in("status", QUEUEING_TOKEN_STATUSES)
      .limit(MAX_ROWS),
    client
      .from("tokens")
      .select(TOKEN_COLUMNS)
      .eq("service_id", serviceId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(COMPLETED_TOKEN_LIMIT),
  ]);

  const failure =
    service.error ?? counterAssignments.error ?? queueing.error ?? completed.error;
  if (failure) {
    throw new Error(`Could not read this Service's queue: ${failure.message}`);
  }

  return {
    services: [service.data as ServiceRow],
    counterAssignments: (counterAssignments.data ?? []) as CounterAssignmentRow[],
    tokens: [
      ...((queueing.data ?? []) as TokenRow[]),
      ...((completed.data ?? []) as TokenRow[]),
    ],
  };
}
