/**
 * The one Token a Visitor is currently holding, persisted so the app survives
 * being closed and reopened (SRS user story 6 / A2 acceptance).
 *
 * Stores only enough to resume — the id to fetch by and the Service to name
 * while that fetch is in flight. Everything else about the Token is re-read
 * from Postgres on every launch; this is a pointer, not a cache.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "flowpilot.visitor.activeToken";

export interface StoredToken {
  tokenId: string;
  serviceId: string;
  serviceName: string;
}

function isStoredToken(value: unknown): value is StoredToken {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as StoredToken).tokenId === "string" &&
    typeof (value as StoredToken).serviceId === "string" &&
    typeof (value as StoredToken).serviceName === "string"
  );
}

/** Null on first launch, or if the stored value is missing or corrupt. */
export async function loadActiveToken(): Promise<StoredToken | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isStoredToken(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveActiveToken(token: StoredToken): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(token));
}

export async function clearActiveToken(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
