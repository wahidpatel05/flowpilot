import { describe, expect, it } from "vitest";
import {
  VISITOR_SESSION_STORAGE_KEY,
  clearVisitorSession,
  readVisitorSession,
  writeVisitorSession,
  type VisitorSession,
} from "./visitorSession";

/** A minimal Storage stand-in — no jsdom is configured for this project. */
function fakeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

const session: VisitorSession = {
  tokenId: "11111111-1111-1111-1111-111111111111",
  tokenNumber: "E-482",
  serviceId: "22222222-2222-2222-2222-222222222222",
};

describe("visitor session persistence", () => {
  it("round-trips a written session", () => {
    const storage = fakeStorage();
    writeVisitorSession(storage, session);
    expect(readVisitorSession(storage)).toEqual(session);
  });

  it("returns null when nothing is stored", () => {
    expect(readVisitorSession(fakeStorage())).toBeNull();
  });

  it("returns null for malformed JSON rather than throwing", () => {
    const storage = fakeStorage({ [VISITOR_SESSION_STORAGE_KEY]: "{not json" });
    expect(readVisitorSession(storage)).toBeNull();
  });

  it("returns null for a value missing required fields", () => {
    const storage = fakeStorage({
      [VISITOR_SESSION_STORAGE_KEY]: JSON.stringify({ tokenId: "x" }),
    });
    expect(readVisitorSession(storage)).toBeNull();
  });

  it("clears a stored session", () => {
    const storage = fakeStorage();
    writeVisitorSession(storage, session);
    clearVisitorSession(storage);
    expect(readVisitorSession(storage)).toBeNull();
  });
});
