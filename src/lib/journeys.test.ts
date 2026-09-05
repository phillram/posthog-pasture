import { describe, expect, it } from "vitest";
import { FLOWS, avgEventsPerUser, findFlow } from "./journeys";

describe("findFlow", () => {
  it("finds every flow in the catalog by id", () => {
    for (const flow of FLOWS) {
      expect(findFlow(flow.id)).toBe(flow);
    }
  });

  it("returns undefined for an unknown id", () => {
    expect(findFlow("no_such_flow")).toBeUndefined();
  });
});

describe("FLOWS", () => {
  it("has no duplicate ids, so round-robin assignment stays even", () => {
    const ids = FLOWS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names every custom event with the pasture_ prefix", () => {
    const custom = FLOWS.flatMap((f) => f.steps.map((s) => s.event)).filter((e) => !e.startsWith("$"));
    expect(custom.every((e) => e.startsWith("pasture_"))).toBe(true);
  });
});

describe("avgEventsPerUser", () => {
  it("returns 0 when no flow is selected", () => {
    expect(avgEventsPerUser([], 3)).toBe(0);
  });

  it("counts the flow steps, the identify, the marker, and one event per flag", () => {
    const steps = findFlow("shopper")!.steps.length;
    expect(avgEventsPerUser(["shopper"], 0)).toBe(steps + 2);
    expect(avgEventsPerUser(["shopper"], 4)).toBe(steps + 2 + 4);
  });

  it("averages across several flows", () => {
    const a = findFlow("shopper")!.steps.length;
    const b = findFlow("support_ticket")!.steps.length;
    expect(avgEventsPerUser(["shopper", "support_ticket"], 0)).toBe(Math.round((a + b) / 2 + 2));
  });
});
