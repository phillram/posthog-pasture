// Server-side journey runner used by the Vercel cron. Mirrors the orchestration
// in `src/app/journeys/page.tsx` but without UI/progress state — it pulls flow
// definitions and user-generation helpers from the same shared libs so the cron
// produces the same shape of data as the interactive page.

import { findFlow } from "@/lib/journeys";
import {
  generateUsername,
  buildPersonProps,
  buildProtocolMarkerEvent,
} from "@/lib/simulatedUsers";
import { planSessionTimestamps } from "@/lib/timing";
import type { CronJourneyConfig } from "./config";

const DECIDE_CONCURRENCY = 6;

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

  // Phase 1: /decide per user (small concurrency to be polite to PostHog)
  const decideUrl = `${apiHost}/decide?v=3`;
  for (let i = 0; i < plan.length; i += DECIDE_CONCURRENCY) {
    const chunk = plan.slice(i, i + DECIDE_CONCURRENCY);
    await Promise.all(
      chunk.map(async (entry) => {
        try {
          const res = await fetch(decideUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: apiKey, distinct_id: entry.username, groups: {} }),
          });
          if (res.ok) {
            const data = (await res.json()) as { featureFlags?: Record<string, boolean | string> };
            entry.flagsByName = data.featureFlags ?? {};
          }
        } catch {
          // Leave flagsByName empty for this user
        }
      })
    );
  }

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
    };

    flowCounts[flow.id] = (flowCounts[flow.id] ?? 0) + 1;

    batchEvents.push({
      event: "$identify",
      distinct_id: username,
      timestamp: tsAt(),
      properties: { $set: personProps, ...commonJourneyProps },
    });
    bumpEvent("$identify");

    batchEvents.push(buildProtocolMarkerEvent(username, "pasture_journey", tsAt()));
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

  // Phase 3: send batch
  const res = await fetch(`${apiHost}/batch/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      batch: batchEvents,
      sent_at: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PostHog /batch/ returned HTTP ${res.status}: ${body.slice(0, 500)}`);
  }

  return {
    totalUsers: plan.length,
    totalEvents: batchEvents.length,
    flowCounts,
    eventCounts,
  };
}
