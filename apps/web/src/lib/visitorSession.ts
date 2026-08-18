/**
 * Visitor session persistence — the localStorage record that lets a Token
 * survive a page reload. A Visitor never has an account (CONTEXT.md); this is
 * just "which Token is this browser tracking," not an identity, and it holds
 * no PII.
 */
export const VISITOR_SESSION_STORAGE_KEY = "flowpilot.visitor.session";

export interface VisitorSession {
  tokenId: string;
  tokenNumber: string;
  serviceId: string;
}

function isVisitorSession(value: unknown): value is VisitorSession {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.tokenId === "string" &&
    typeof record.tokenNumber === "string" &&
    typeof record.serviceId === "string"
  );
}

/** Never throws: a corrupt or foreign value is treated as "no session". */
export function readVisitorSession(
  storage: Pick<Storage, "getItem">,
): VisitorSession | null {
  const raw = storage.getItem(VISITOR_SESSION_STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isVisitorSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeVisitorSession(
  storage: Pick<Storage, "setItem">,
  session: VisitorSession,
): void {
  storage.setItem(VISITOR_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearVisitorSession(storage: Pick<Storage, "removeItem">): void {
  storage.removeItem(VISITOR_SESSION_STORAGE_KEY);
}
