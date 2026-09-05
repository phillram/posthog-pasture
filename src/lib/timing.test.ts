import { describe, expect, it } from "vitest";
import { TIMING_MODES, planSessionTimestamps, type TimingMode } from "./timing";

const MODES = TIMING_MODES.map((m) => m.id);
const NOW = Date.parse("2026-06-01T12:00:00.000Z");

function plan(mode: TimingMode, eventCount: number, userIndex = 0): number[] {
  return planSessionTimestamps(NOW, mode, userIndex, eventCount).map((t) => Date.parse(t));
}

describe("planSessionTimestamps", () => {
  it.each(MODES)("never returns a timestamp after now (%s)", (mode) => {
    // The regression this guards: gaps used to be drawn per event with no cap,
    // so a long session ran past `now`. With a long flow, 20 project flags, and
    // "Past 5 days", four users in five ended in the future, up to 5 days
    // ahead. PostHog rewrites those to the ingestion time and the spread is
    // lost. 33 events is that worst case.
    for (let user = 0; user < 300; user++) {
      for (const eventCount of [1, 2, 13, 33, 120]) {
        const stamps = plan(mode, eventCount, user);
        expect(Math.max(...stamps)).toBeLessThanOrEqual(NOW);
      }
    }
  });

  it.each(MODES)("returns the requested count in ascending order (%s)", (mode) => {
    for (let user = 0; user < 100; user++) {
      const stamps = plan(mode, 20, user);
      expect(stamps).toHaveLength(20);
      for (let i = 1; i < stamps.length; i++) {
        expect(stamps[i]).toBeGreaterThanOrEqual(stamps[i - 1]);
      }
    }
  });

  it.each(MODES)("keeps the whole session inside the spread window (%s)", (mode) => {
    // A session that starts before the window makes a "past 24h" run show
    // events from last week.
    const windowMs = { burst: 60 * 60 * 1000, "1h": 60 * 60 * 1000, "1d": 864e5, "5d": 5 * 864e5, "10d": 10 * 864e5, "15d": 15 * 864e5, "30d": 30 * 864e5 }[mode];
    for (let user = 0; user < 100; user++) {
      const stamps = plan(mode, 33, user);
      expect(Math.min(...stamps)).toBeGreaterThanOrEqual(NOW - windowMs);
    }
  });

  it("holds a burst session close to now instead of running it forward", () => {
    // 500 users used to push the last one 8 minutes past ingestion time.
    const last = plan("burst", 33, 499);
    expect(Math.max(...last)).toBeLessThanOrEqual(NOW);
    expect(Math.max(...last)).toBeGreaterThan(NOW - 10 * 60 * 1000);
  });

  it("spreads events instead of stacking them on one instant", () => {
    const stamps = plan("1d", 12);
    expect(new Set(stamps).size).toBeGreaterThan(1);
    expect(Math.max(...stamps) - Math.min(...stamps)).toBeGreaterThan(0);
  });

  it("returns nothing for a user with no events", () => {
    expect(planSessionTimestamps(NOW, "1d", 0, 0)).toEqual([]);
  });
});
