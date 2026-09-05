import { describe, expect, it } from "vitest";
import type { Survey } from "posthog-js";
import { surveyStatus } from "./surveyStatus";

const HOUR = 60 * 60 * 1000;

function survey(start: string | null, end: string | null): Survey {
  return { start_date: start, end_date: end } as Survey;
}

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

describe("surveyStatus", () => {
  it.each([
    ["no dates", null, null, "draft"],
    ["start in the future", iso(HOUR), null, "draft"],
    ["start in the past", iso(-HOUR), null, "running"],
    ["start past, end future", iso(-HOUR), iso(HOUR), "running"],
    ["end in the past", iso(-2 * HOUR), iso(-HOUR), "completed"],
    ["end but no start", null, iso(-HOUR), "completed"],
  ])("returns %s -> %s", (_label, start, end, expected) => {
    expect(surveyStatus(survey(start, end))).toBe(expected);
  });

  it("treats an unparseable date as absent instead of throwing", () => {
    expect(surveyStatus(survey("not-a-date", null))).toBe("draft");
    expect(surveyStatus(survey(iso(-HOUR), "not-a-date"))).toBe("running");
  });
});
