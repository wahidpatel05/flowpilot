/**
 * Lets a Visitor cancel their Token (A4), so they aren't counted in a queue
 * they've left. There is no cancel_token RPC in this schema — cancelling is
 * an ordinary lifecycle update, same as joinQueue.ts's ordinary insert, per
 * the epic's "joining a queue and progressing a token lifecycle remain
 * ordinary inserts and updates" decision. Other surfaces (Desk, Control)
 * already subscribe to `tokens` and pick this up on their own; nothing here
 * needs to tell them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function cancelToken(client: SupabaseClient, tokenId: string): Promise<void> {
  const { error } = await client
    .from("tokens")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", tokenId);

  if (error) {
    throw new Error(`Could not leave the queue: ${error.message}`);
  }
}
