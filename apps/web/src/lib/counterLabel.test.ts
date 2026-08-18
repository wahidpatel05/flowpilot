import { describe, expect, it } from "vitest";
import { counterLabel, FREE_COUNTER_SUFFIX } from "./counterLabel";

describe("counterLabel", () => {
  it("leads with the Service when the Counter is bound to one", () => {
    const label = counterLabel({ counterName: "Counter 2", serviceName: "Examination Cell" });
    expect(label.primary).toBe("Examination Cell");
    expect(label.secondary).toBe("Counter 2");
    expect(label.full).toBe("Examination Cell · Counter 2");
  });

  it("keeps the desk name findable, so a clerk sitting at it can still pick it", () => {
    const label = counterLabel({ counterName: "Counter 3", serviceName: "Fees" });
    expect(label.full).toContain("Counter 3");
  });

  it("leads with the desk when it is free, since there is no Service to name", () => {
    const label = counterLabel({ counterName: "Counter 4", serviceName: null });
    expect(label.primary).toBe("Counter 4");
    expect(label.secondary).toBe(FREE_COUNTER_SUFFIX);
    expect(label.full).toBe("Counter 4 · free desk");
  });

  it("treats a blank Service name as no binding rather than rendering a dangling separator", () => {
    for (const blank of ["", "   "]) {
      const label = counterLabel({ counterName: "Counter 5", serviceName: blank });
      expect(label.primary).toBe("Counter 5");
      expect(label.full).toBe("Counter 5 · free desk");
    }
  });

  it("trims a padded Service name instead of leaking the padding into the label", () => {
    const label = counterLabel({ counterName: "Counter 1", serviceName: "  Documents  " });
    expect(label.primary).toBe("Documents");
    expect(label.full).toBe("Documents · Counter 1");
  });
});
