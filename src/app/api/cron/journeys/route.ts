// Vercel cron endpoint. Triggered daily by the schedule in `vercel.json`.
// Setup, env vars, and how to disable are documented in this folder's README.
//
// Auth: Vercel cron sends `Authorization: Bearer <CRON_SECRET>` if the env var
// is set in your Vercel project. We require it so random callers can't poke
// the endpoint.

import { NextResponse } from "next/server";
import { CRON_JOURNEY_CONFIG } from "./config";
import { runJourneyCron } from "./runner";

export const dynamic = "force-dynamic";
// Journey runs can be slow when /decide is rate-limited — give them more room.
export const maxDuration = 60;

export async function GET(request: Request) {
  const apiKey =
    process.env.POSTHOG_API_KEY ?? process.env.POSTHOG_PROJECT_API_KEY;
  const apiHost =
    process.env.POSTHOG_HOST ??
    process.env.NEXT_PUBLIC_POSTHOG_HOST ??
    "https://us.i.posthog.com";
  const cronSecret = process.env.CRON_SECRET;

  if (!apiKey) {
    console.error(
      "[cron/journeys] POSTHOG_API_KEY (or POSTHOG_PROJECT_API_KEY) env var is not set"
    );
    return NextResponse.json(
      {
        ok: false,
        error:
          "POSTHOG_API_KEY (or POSTHOG_PROJECT_API_KEY) env var is not set",
      },
      { status: 500 }
    );
  }
  if (!cronSecret) {
    console.error("[cron/journeys] CRON_SECRET env var is not set");
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET env var is not set" },
      { status: 500 }
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runJourneyCron({ apiKey, apiHost, config: CRON_JOURNEY_CONFIG });
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...result });
  } catch (err) {
    console.error("[cron/journeys] runner failed:", err);
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
