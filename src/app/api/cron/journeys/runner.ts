// Server-side journey runner used by the Vercel cron. Mirrors the orchestration
// in `src/app/journeys/page.tsx` but without UI/progress state — it pulls flow
// definitions and user-generation helpers from the same shared libs so the cron
// produces the same shape of data as the interactive page.

import { findFlow } from "@/lib/journeys";
import {
  generateUsername,
  buildPersonProps,
  buildProtocolMarkerEvent,
  newSessionId,
  flagAttributionProps,
} from "@/lib/simulatedUsers";
import { planSessionTimestamps } from "@/lib/timing";
import { fetchFlagsForUsers, sendEventBatch } from "@/lib/posthogIngest";
import type { CronJourneyConfig } from "./config";

export interface CronJourneyResult {
  totalUsers: number;
  totalEvents: number;
  flowCounts: Record<string, number>;
  eventCounts: Record<string, number>;
}

interface RunOptions {
  apiKey: string;
  apiHost: string;
  config: CronJourneyConfig;
}

export async function runJourneyCron({ apiKey, apiHost, config }: RunOptions): Promise<CronJourneyResult> {
  const flows = config.flowIds
    .map((id) => findFlow(id))
    .filter((f): f is NonNullable<ReturnType<typeof findFlow>> => Boolean(f));

  if (flows.length === 0) {
    throw new Error("No valid flow IDs in cron config");
  }

  const now = Date.now();
  const plan = Array.from({ length: config.userCount }, (_, i) => {
    const flow = flows[i % flows.length];
    const username = generateUsername(i);
    return {
      username,
      flow,
      personProps: buildPersonProps(config.profilePreset, username),
      flagsByName: {} as Record<string, boolean | string>,
    };
  });

  // Phase 1: read each user's flags
  const flagsPerUser = await fetchFlagsForUsers(
    plan.map((entry) => entry.username),
    { apiKey, apiHost }
  );
  flagsPerUser.forEach((flags, i) => {
    plan[i].flagsByName = flags;
  });

  // Phase 2: build batch
  const batchEvents: Record<string, unknown>[] = [];
  const eventCounts: Record<string, number> = {};
  const flowCounts: Record<string, number> = {};

  const bumpEvent = (name: string) => {
    eventCounts[name] = (eventCounts[name] ?? 0) + 1;
  };

  for (let i = 0; i < plan.length; i++) {
    const { username, flow, personProps, flagsByName } = plan[i];
    const exposedFlags = config.flagMode === "all" ? Object.entries(flagsByName) : [];
    // $identify + the protocol marker + one event per exposed flag + the flow.
    const eventCount = 2 + exposedFlags.length + flow.steps.length;
    const stamps = planSessionTimestamps(now, config.timingMode, i, eventCount);
    let stampIndex = 0;
    const tsAt = () => stamps[stampIndex++];
    const commonJourneyProps = {
      pasture_journey_flow: flow.id,
      pasture_journey_user_index: i,
      pasture_cron: true,
      $session_id: newSessionId(),
      ...flagAttributionProps(Object.fromEntries(exposedFlags)),
    };

    flowCounts[flow.id] = (flowCounts[flow.id] ?? 0) + 1;

    batchEvents.push({
      event: "$identify",
      distinct_id: username,
      timestamp: tsAt(),
      properties: { $set: personProps, ...commonJourneyProps },
    });
    bumpEvent("$identify");

    batchEvents.push(buildProtocolMarkerEvent(username, "pasture_journey", tsAt(), commonJourneyProps));
    bumpEvent("$set");

    for (const [flagName, flagValue] of exposedFlags) {
      batchEvents.push({
        event: "$feature_flag_called",
        distinct_id: username,
        timestamp: tsAt(),
        properties: {
          $feature_flag: flagName,
          $feature_flag_response: flagValue,
          ...commonJourneyProps,
        },
      });
      bumpEvent("$feature_flag_called");
    }

    for (const fStep of flow.steps) {
      const dynamic = fStep.dynamicProps ? fStep.dynamicProps() : {};
      batchEvents.push({
        event: fStep.event,
        distinct_id: username,
        timestamp: tsAt(),
        properties: { ...(fStep.props ?? {}), ...dynamic, ...commonJourneyProps },
      });
      bumpEvent(fStep.event);
    }
  }

  // Phase 3: send the events, in chunks
  await sendEventBatch(batchEvents, { apiKey, apiHost });

  return {
    totalUsers: plan.length,
    totalEvents: batchEvents.length,
    flowCounts,
    eventCounts,
  };
}
