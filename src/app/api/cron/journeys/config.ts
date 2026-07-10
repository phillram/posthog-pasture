// Defaults the daily cron uses when generating a journey run. Edit these to
// change what the scheduled run produces — they are intentionally separate
// from the Journeys page UI so tweaking the cron never affects interactive
// runs (and vice-versa).

import type { ProfilePreset } from "@/lib/simulatedUsers";
import type { TimingMode } from "@/lib/timing";

export interface CronJourneyConfig {
  /** Flow IDs from `src/lib/journeys.ts`. Users are split round-robin. */
  flowIds: string[];
  /** Number of simulated users to generate per cron run. */
  userCount: number;
  /** Person profile preset applied to every user in the run. */
  profilePreset: ProfilePreset;
  /** "all" fires `$feature_flag_called` for every flag returned by /decide. */
  flagMode: "all" | "none";
  /** Timing spread — "1d" gives a natural curve over the past 24h. */
  timingMode: TimingMode;
}

export const CRON_JOURNEY_CONFIG: CronJourneyConfig = {
  flowIds: [
    "shopper",
    "window_shopper",
    "new_signup",
    "search_and_browse",
    "checkout_abandon",
    "feature_explorer",
    "support_ticket",
    "power_user",
  ],
  userCount: 50,
  profilePreset: "casual",
  flagMode: "all",
  timingMode: "1d",
};
