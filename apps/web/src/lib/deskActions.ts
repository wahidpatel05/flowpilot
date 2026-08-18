import { supabase } from "./supabaseClient";
import type { TokenStatus } from "./core";
import type { InterventionRow } from "./interventionTarget";

/**
 * The Desk's writes. Token status has no RPC — there is no keystone hop to
 * protect here, unlike `counter_assignments` (INTEGRATION.md), so the Desk
 * moves a Token forward with a plain, guarded update: the `.eq("status", ...)`
 * predicate means a stale click (someone else already actioned this Token)
 * updates zero rows instead of silently double-applying, and is reported back
 * as a plain-language refusal rather than a crash.
 */
async function transitionToken(
  tokenId: string,
  fromStatus: TokenStatus,
  toStatus: TokenStatus,
  timestampColumn?: string,
): Promise<void> {
  const patch: Record<string, string> = { status: toStatus };
  if (timestampColumn !== undefined) {
    patch[timestampColumn] = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("tokens")
    .update(patch)
    .eq("id", tokenId)
    .eq("status", fromStatus)
    .select("id");

  if (error !== null) {
    throw new Error(`DeQueue: could not update the token — ${error.message}`);
  }
  if ((data ?? []).length === 0) {
    throw new Error(
      "DeQueue: that token has already moved on — someone else may have actioned it first.",
    );
  }
}

export function callToken(tokenId: string): Promise<void> {
  return transitionToken(tokenId, "waiting", "called", "called_at");
}

export function startServiceForToken(tokenId: string): Promise<void> {
  return transitionToken(tokenId, "called", "serving", "service_started_at");
}

export function completeServiceForToken(tokenId: string): Promise<void> {
  return transitionToken(tokenId, "serving", "completed", "completed_at");
}

/** Skip applies to a called Token that did not show up — see QueueActions' Skip button. */
export function skipToken(tokenId: string): Promise<void> {
  return transitionToken(tokenId, "called", "skipped");
}

/** The Desk's Counter toggle — see supabase/migrations/0004_desk_counter_toggle.sql. */
export async function setCounterActive(counterId: string, active: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_counter_active", {
    p_counter_id: counterId,
    p_active: active,
  });
  if (error !== null) throw new Error(error.message);
}

/**
 * The Staff member's consent step (CONTEXT.md: DeQueue may never silently
 * move a human). Desk is a valid caller of `apply_intervention()` per
 * INTEGRATION.md's RPC table, and applying immediately after accepting is
 * what makes "the Staff member's queue then reflects the new Service" true
 * without depending on Control's Apply screen (W4).
 *
 * Takes the whole row, not just the id, because `accept_intervention()`
 * rejects a call on an Intervention that is already `accepted` — retrying
 * Accept after a prior run's `apply_intervention()` failed (dropped
 * connection, a guard raised) must skip straight to `apply_intervention()`
 * rather than stranding the Intervention on a permanent error.
 */
export async function acceptIncomingAssignment(intervention: InterventionRow): Promise<void> {
  if (intervention.status !== "accepted") {
    const accepted = await supabase.rpc("accept_intervention", {
      p_intervention_id: intervention.id,
    });
    if (accepted.error !== null) throw new Error(accepted.error.message);
  }

  const applied = await supabase.rpc("apply_intervention", {
    p_intervention_id: intervention.id,
  });
  if (applied.error !== null) throw new Error(applied.error.message);
}
