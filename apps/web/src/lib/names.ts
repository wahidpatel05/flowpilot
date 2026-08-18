/**
 * id → display name, for surfaces that must never render a raw identifier.
 *
 * `CounterState` / `StaffMemberState` / the RPC payloads are frozen engine
 * contracts carrying only ids, but every sentence Control renders has to name
 * the actual Staff member, Counter and Service. This is the one shape those
 * lookups take, kept in `lib` so pure modules can describe a move without
 * importing a React hook.
 */
export type NameLookup = Readonly<Record<string, string>>;

/**
 * The display name for an id. Falls back to the id itself only when the
 * lookup genuinely has no name for it — a caller rendering user-facing prose
 * should prefer `describeParty`, which never leaks an identifier.
 */
export function displayName(lookup: NameLookup, id: string): string {
  return lookup[id] ?? id;
}

/**
 * The same lookup, but for prose: an id we hold no name for reads as a
 * placeholder phrase rather than a uuid. Used by anything a Manager reads out
 * loud.
 */
export function describeParty(
  lookup: NameLookup,
  id: string | undefined,
  fallback: string,
): string {
  if (id === undefined) return fallback;
  const name = lookup[id];
  if (name === undefined || name === id) return fallback;
  return name;
}
