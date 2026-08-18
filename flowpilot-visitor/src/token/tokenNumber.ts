/**
 * A display token number, e.g. "E-042" — mirrors the seeded convention
 * (`upper(left(slug/name, 1)) || '-' || <digits>`, `supabase/migrations/0001_init.sql`).
 *
 * `tokens.token_number` carries no uniqueness constraint (verified against the
 * schema before writing this) — the row's `id` is the real identity, and this
 * is display-only. A collision is a cosmetic coincidence, never a correctness
 * bug, so a three-digit random suffix is enough for a hackathon demo.
 */
export function generateTokenNumber(serviceNameOrSlug: string): string {
  const firstLetter = serviceNameOrSlug.match(/[a-zA-Z]/)?.[0]?.toUpperCase();
  const prefix = firstLetter ?? "V";
  const suffix = String(Math.floor(Math.random() * 900) + 100);
  return `${prefix}-${suffix}`;
}
