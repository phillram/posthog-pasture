// Timestamp jitter for simulated users. The Experiments and Journeys runners
// used to fire every event for a user at (approximately) the same moment, which
// produces unrealistic flat-line trends in PostHog. These helpers spread each
// user's session across a configurable past window and pick natural-looking
// gaps between consecutive events.
//
// Note on future timestamps: PostHog rejects events whose timestamp is more
// than ~23 hours ahead of ingestion time, so all spread is into the past only.

export type TimingMode = "burst" | "1h" | "1d" | "5d";

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
    description: "Sessions spread across the past hour, gaps 100ms–5min.",
  },
  {
    id: "1d",
    label: "Past day",
    description: "Sessions spread across the past 24h, gaps 100ms–30min.",
  },
  {
    id: "5d",
    label: "Past 5 days",
    description: "Sessions spread across the past 5 days, gaps 100ms–6h.",
  },
];

interface ModeShape {
  /** Total window for spreading session start times, in ms. */
  spreadMs: number;
  /** Min/max per-event gap inside a single user's session, in ms. */
  minGapMs: number;
  maxGapMs: number;
}

const SHAPES: Record<TimingMode, ModeShape> = {
  burst: { spreadMs: 0, minGapMs: 50, maxGapMs: 50 },
  "1h": { spreadMs: 60 * 60 * 1000, minGapMs: 100, maxGapMs: 5 * 60 * 1000 },
  "1d": { spreadMs: 24 * 60 * 60 * 1000, minGapMs: 100, maxGapMs: 30 * 60 * 1000 },
  "5d": { spreadMs: 5 * 24 * 60 * 60 * 1000, minGapMs: 100, maxGapMs: 6 * 60 * 60 * 1000 },
};

/** Random integer in [min, max]. */
function randInt(min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Pick the starting timestamp (ms) for a user's session. Burst mode falls back
 * to a deterministic per-user offset so events still order correctly.
 */
export function pickSessionStart(now: number, mode: TimingMode, userIndex: number): number {
  const shape = SHAPES[mode];
  if (shape.spreadMs === 0) {
    // Preserve the legacy "1s between users" stagger for burst.
    return now + userIndex * 1000;
  }
  return now - randInt(0, shape.spreadMs);
}

/**
 * Random gap (ms) to add to the previous event's timestamp. Burst mode returns
 * a fixed 50ms so existing behaviour is preserved when users opt out of jitter.
 */
export function pickEventGap(mode: TimingMode): number {
  const shape = SHAPES[mode];
  return randInt(shape.minGapMs, shape.maxGapMs);
}

/**
 * Build an iterator-style timestamp generator for a single user. Returns the
 * next ISO timestamp on every call, advancing by a (mode-dependent) gap.
 */
export function makeTimestamper(startMs: number, mode: TimingMode): () => string {
  let cursor = startMs;
  let firstCall = true;
  return () => {
    if (!firstCall) cursor += pickEventGap(mode);
    firstCall = false;
    return new Date(cursor).toISOString();
  };
}
