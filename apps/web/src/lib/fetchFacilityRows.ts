import { supabase } from "./supabaseClient";
import type { FacilityRows } from "./core";

/**
 * One round trip per table, run in parallel. This is the only place raw
 * Supabase queries happen for the facility view — everything downstream of
 * this reads the typed `FacilityRows` shape that `projectFacility` expects.
 */
export async function fetchFacilityRows(): Promise<FacilityRows> {
  const [
    servicesRes,
    countersRes,
    assignmentsRes,
    tokensRes,
    staffRes,
    staffSkillsRes,
    flowEdgesRes,
  ] = await Promise.all([
    supabase
      .from("services")
      .select("id,name,slug,default_service_minutes,healthy_wait_threshold,critical_wait_threshold"),
    supabase.from("counters").select("id,name,status"),
    supabase
      .from("counter_assignments")
      .select("id,counter_id,staff_id,service_id,assignment_type,status,started_at,ends_at"),
    // No row cap: projectFacility already trims each Service to its own most
    // recent 30 completed durations. A facility-wide LIMIT here would instead
    // cap the whole table by recency regardless of Service, so a busy Service
    // could crowd a quiet one out of the result set entirely — the quiet one
    // would then read as an unwarranted cold start. At hackathon demo scale
    // this table is a few dozen rows; revisit with a per-Service query if the
    // seed ever grows into the thousands.
    supabase
      .from("tokens")
      .select(
        "id,service_id,token_number,status,priority,joined_at,called_at,service_started_at,completed_at,is_simulated",
      )
      .order("joined_at", { ascending: false }),
    supabase.from("staff").select("id,name,status"),
    supabase.from("staff_skills").select("staff_id,service_id,proficiency"),
    supabase.from("service_flow_edges").select("from_service_id,to_service_id,expected_share,source"),
  ]);

  for (const res of [
    servicesRes,
    countersRes,
    assignmentsRes,
    tokensRes,
    staffRes,
    staffSkillsRes,
    flowEdgesRes,
  ]) {
    if (res.error) {
      throw new Error(`DeQueue: failed to read facility rows — ${res.error.message}`);
    }
  }

  return {
    services: servicesRes.data ?? [],
    counters: countersRes.data ?? [],
    counterAssignments: assignmentsRes.data ?? [],
    tokens: tokensRes.data ?? [],
    staff: staffRes.data ?? [],
    staffSkills: staffSkillsRes.data ?? [],
    serviceFlowEdges: flowEdgesRes.data ?? [],
  };
}
