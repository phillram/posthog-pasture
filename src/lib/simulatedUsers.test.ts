import { describe, expect, it } from "vitest";
import { buildPersonProps, buildProtocolMarkerEvent, generateUsername } from "./simulatedUsers";

describe("generateUsername", () => {
  it("pads the index to three digits and offsets it by one", () => {
    expect(generateUsername(0)).toMatch(/^pasture_[a-z]+_[a-z]+_001$/);
    expect(generateUsername(41)).toMatch(/_042$/);
  });

  it("keeps a four-digit suffix past user 999 instead of truncating", () => {
    expect(generateUsername(999)).toMatch(/_1000$/);
  });
});

describe("buildPersonProps", () => {
  it.each([
    ["casual", "free"],
    ["power_user", "pro"],
    ["enterprise", "enterprise"],
  ] as const)("gives the %s preset the %s plan", (preset, plan) => {
    expect(buildPersonProps(preset, "pasture_test_001").plan).toBe(plan);
  });

  it("only gives the enterprise preset a seat count", () => {
    expect(buildPersonProps("enterprise", "u").seats).toEqual(expect.any(Number));
    expect(buildPersonProps("casual", "u").seats).toBeUndefined();
  });

  it("dates the signup in the past so trends do not start in the future", () => {
    for (let i = 0; i < 200; i++) {
      const props = buildPersonProps("casual", "u");
      expect(Date.parse(props.signup_date as string)).toBeLessThanOrEqual(Date.now());
    }
  });

  it("tags every simulated person so they can be filtered out in PostHog", () => {
    expect(buildPersonProps("casual", "u").pasture_simulated).toBe(true);
  });
});

describe("buildProtocolMarkerEvent", () => {
  it("sends the marker as a $set event on the given distinct id", () => {
    const event = buildProtocolMarkerEvent("pasture_a_b_001", "pasture_journey", "2026-01-01T00:00:00.000Z");
    expect(event).toEqual({
      event: "$set",
      distinct_id: "pasture_a_b_001",
      timestamp: "2026-01-01T00:00:00.000Z",
      properties: { $set: { pasture_journey: true } },
    });
  });
});
