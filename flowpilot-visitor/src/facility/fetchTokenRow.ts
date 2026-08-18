/**
 * The Visitor's own Token — the one row that is authoritative about status,
 * independent of whichever Service's queue it belongs to. Fetched by id, not
 * discovered by scanning a Service's tokens, since a Visitor may hold a Token
 * for a Service that later gets renamed, deactivated, or deleted entirely.
 *
 * Returns null rather than throwing when the row is gone (a stale local
 * pointer after `reset_demo()`, or an id that never existed) — the caller
 * clears its persisted Token rather than showing an error for a state that is
 * ordinary rather than exceptional.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TokenRow } from "@flowpilot/core";
import { TOKEN_COLUMNS } from "./rows";

export async function fetchTokenRow(
  client: SupabaseClient,
  tokenId: string,
): Promise<TokenRow | null> {
  const { data, error } = await client
    .from("tokens")
    .select(TOKEN_COLUMNS)
    .eq("id", tokenId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not read this Token: ${error.message}`);
  }
  return data as TokenRow | null;
}
