/**
 * Client-generated Token numbers for the Visitor PWA, following the
 * <initial>-<3 digits> convention reset_demo() and simulate_rush() already
 * use in SQL. There is no client-callable RPC over token_number_seq, so —
 * like the golden path script's own Visitor insert — this generates a number
 * rather than reserving one from the sequence. token_number carries no
 * uniqueness constraint (see supabase/migrations/0001_init.sql), so a
 * collision is cosmetic, never a correctness bug.
 */
export function generateTokenNumber(serviceSlug: string | undefined): string {
  const trimmed = serviceSlug?.trim() ?? "";
  const prefix = (trimmed.length > 0 ? trimmed : "V").charAt(0).toUpperCase();
  const suffix = Math.floor(Math.random() * 900) + 100;
  return `${prefix}-${suffix}`;
}
