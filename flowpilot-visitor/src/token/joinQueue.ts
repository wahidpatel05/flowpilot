/**
 * Writes a real Token row. There is no join_queue RPC in this schema (checked
 * supabase/migrations before writing this) — the golden-path script joins the
 * same way, a direct insert into `tokens`, relying on the demo-scope RLS policy
 * that grants anon insert. status and joined_at are left to their column
 * defaults ('waiting', now()); only what a join actually decides is set.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TokenRow } from "@flowpilot/core";
import { generateTokenNumber } from "./tokenNumber";
import { TOKEN_COLUMNS } from "../facility/rows";

export async function joinQueue(
  client: SupabaseClient,
  service: { id: string; name: string },
): Promise<TokenRow> {
  const { data, error } = await client
    .from("tokens")
    .insert({
      service_id: service.id,
      token_number: generateTokenNumber(service.name),
      is_simulated: false,
    })
    .select(TOKEN_COLUMNS)
    .single();

  if (error) {
    throw new Error(`Could not join the queue: ${error.message}`);
  }
  return data as TokenRow;
}
