// Timestamp jitter for simulated users. The Experiments and Journeys runners
// used to fire every event for a user at (approximately) the same moment, which
// produces unrealistic flat-line trends in PostHog. These helpers spread each
// user's session across a configurable past window and pick natural-looking
// gaps between consecutive events.
//
// Note on future timestamps: PostHog rejects events whose timestamp is more
// than ~23 hours ahead of ingestion time, so all spread is into the past only.
// `planSessionTimestamps` is the only entry point, because it is the only shape
// that can keep that promise. It needs the event count before it picks the
// gaps. Drawing each gap on its own, as this module used to, let a long session
// run past "now" and lose the curve the spread exists to create.

export type TimingMode = "burst" | "1h" | "1d" | "5d" | "10d" | "15d" | "30d";

export interface TimingModeMeta {
  id: TimingMode;
  label: string;
  description: string;
}

export const TIMING_MODES: TimingModeMeta[] = [
  {
    id: "burst",
    label: "Burst",
    description: "All events fire close to now (uniform 50ms gaps).",
  },
  {
    id: "1h",
    label: "Past hour",
    description: "Sessions start inside the past hour and run up to 15 minutes.",
  },
  {
    id: "1d",
    label: "Past day",
    description: "Sessions start inside the past 24h and run up to 45 minutes.",
  },
  {
    id: "5d",
    label: "Past 5 days",
    description: "Sessions start inside the past 5 days and run up to 1 hour.",
  },
  {
    id: "10d",
    label: "Past 10 days",
    description: "Sessions start inside the past 10 days and run up to 1 hour.",
  },
  {
    id: "15d",
    label: "Past 15 days",
    description: "Sessions start inside the past 15 days and run up to 90 minutes.",
  },
  {
    id: "30d",
    label: "Past 30 days",
    description: "Sessions start inside the past 30 days and run up to 90 minutes.",
  },
];

interface ModeShape {
  /** Total window for spreading session start times, in ms. */
  spreadMs: number;
  /** Smallest gap between two consecutive events in one session, in ms. */
  minGapMs: number;
  /**
   * Longest a single simulated session may run, in ms. This cap is what keeps
   * a session inside its spread window however many events the session holds.
   */
  maxSessionMs: number;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const SHAPES: Record<TimingMode, ModeShape> = {
  burst: { spreadMs: 0, minGapMs: 50, maxSessionMs: 0 },
  "1h": { spreadMs: HOUR, minGapMs: 100, maxSessionMs: 15 * MINUTE },
  "1d": { spreadMs: DAY, minGapMs: 100, maxSessionMs: 45 * MINUTE },
  "5d": { spreadMs: 5 * DAY, minGapMs: 100, maxSessionMs: HOUR },
  "10d": { spreadMs: 10 * DAY, minGapMs: 100, maxSessionMs: HOUR },
  "15d": { spreadMs: 15 * DAY, minGapMs: 100, maxSessionMs: 90 * MINUTE },
  "30d": { spreadMs: 30 * DAY, minGapMs: 100, maxSessionMs: 90 * MINUTE },
};

/** Random integer in [min, max]. */
function randInt(min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Split `totalMs` into `count` uneven gaps, each one at least `minGapMs`.
 * Uneven on purpose. Equal gaps read as a machine in PostHog's session view.
 */
function shareOutGaps(totalMs: number, count: number, minGapMs: number): number[] {
  if (count <= 0) return [];
  const floorTotal = minGapMs * count;
  const slack = Math.max(0, totalMs - floorTotal);
  const weights = Array.from({ length: count }, () => Math.random());
  const weightSum = weights.reduce((sum, w) => sum + w, 0) || count;
  return weights.map((w) => minGapMs + Math.round((w / weightSum) * slack));
}

/**
 * Timestamps for one simulated user's whole session, in ascending order.
 *
 * Every timestamp is at or before `now`. That is the contract the Journeys and
 * Experiments UI states, and PostHog needs it. PostHog rejects a timestamp far
 * in the future, and it rewrites a rejected timestamp to the ingestion time,
 * which turns a spread-out run back into one tall spike.
 *
 * @param now        Reference time in ms. Every result is at or before it.
 * @param mode       Spread mode the person picked.
 * @param userIndex  Position of this user in the run. Staggers burst mode.
 * @param eventCount How many events this user emits. Must be known up front.
 */
export function planSessionTimestamps(
  now: number,
  mode: TimingMode,
  userIndex: number,
  eventCount: number
): string[] {
  if (eventCount <= 0) return [];
  const shape = SHAPES[mode];
  const gapCount = eventCount - 1;

  if (shape.spreadMs === 0) {
    // Burst: one second between users, 50ms between events, all in the recent
    // past. The old code staggered users into the future, which put the last
    // user of a 500-user run 8 minutes ahead of ingestion.
    const start = now - userIndex * SECOND - gapCount * shape.minGapMs;
    return Array.from({ length: eventCount }, (_, i) => new Date(start + i * shape.minGapMs).toISOString());
  }

  const floorMs = gapCount * shape.minGapMs;
  const sessionMs = Math.max(floorMs, randInt(Math.min(floorMs, shape.maxSessionMs), shape.maxSessionMs));
  // Hold back room for the whole session inside the window, so the last event
  // still lands at or before `now`.
  const latestStart = now - sessionMs;
  const earliestStart = Math.min(latestStart, now - shape.spreadMs);
  const sessionStart = randInt(earliestStart, latestStart);

  const gaps = shareOutGaps(sessionMs, gapCount, shape.minGapMs);
  const timestamps: string[] = [];
  let cursor = sessionStart;
  for (let i = 0; i < eventCount; i++) {
    if (i > 0) cursor += gaps[i - 1];
    timestamps.push(new Date(Math.min(cursor, now)).toISOString());
  }
  return timestamps;
}
