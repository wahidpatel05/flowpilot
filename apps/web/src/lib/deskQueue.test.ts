import { describe, expect, it } from "vitest";
import { selectWaitingPreview } from "./deskQueue";
import type { ProjectedQueueEntry } from "./core";

function entry(overrides: Partial<ProjectedQueueEntry>): ProjectedQueueEntry {
  return {
    tokenId: "t1",
    tokenNumber: "E-001",
    status: "waiting",
    isSimulated: false,
    joinedAtMillis: 0,
    priority: 0,
    position: 0,
    ...overrides,
  };
}

describe("selectWaitingPreview", () => {
  it("keeps only waiting entries, in queue order", () => {
    const queue = [
      entry({ tokenId: "a", status: "called", position: 0 }),
      entry({ tokenId: "b", status: "waiting", position: 1 }),
      entry({ tokenId: "c", status: "waiting", position: 2 }),
    ];
    expect(selectWaitingPreview(queue, 5).map((e) => e.tokenId)).toEqual(["b", "c"]);
  });

  it("respects the limit", () => {
    const queue = [
      entry({ tokenId: "a", status: "waiting", position: 0 }),
      entry({ tokenId: "b", status: "waiting", position: 1 }),
      entry({ tokenId: "c", status: "waiting", position: 2 }),
    ];
    expect(selectWaitingPreview(queue, 2).map((e) => e.tokenId)).toEqual(["a", "b"]);
  });

  it("returns an empty array when nobody is waiting", () => {
    expect(selectWaitingPreview([], 5)).toEqual([]);
  });
});
