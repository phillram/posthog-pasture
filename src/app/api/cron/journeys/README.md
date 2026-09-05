# Daily journey cron (optional, power-user only)

This folder contains an **optional** scheduled task that fires a journey run once a day. It is for power users who want their PostHog project to stay continuously populated with realistic activity without clicking the Journeys page button. Day-to-day usage of Pasture (running journeys, experiments, surveys, etc. from the UI) does **not** depend on any of this — it is fully self-contained.

If you don't want it: don't deploy `vercel.json`, or remove the `crons` block from it. The endpoint will simply never be called.

## What it does

When triggered, it generates a batch of simulated users running pre-built journey flows (Shopper, Window Shopper, New Signup, Search & Browse, Checkout Abandon, Feature Explorer, Support Ticket, Power User by default) and sends the events to PostHog with timestamps spread across the past 24 hours so trend lines look natural rather than spiking. It shares its flag lookup and event sending with the Journeys page, so the two cannot drift apart.

## Setup (Vercel)

1. **Deploy on Vercel.** The cron is scheduled by `vercel.json` at the repo root.
2. **Add three environment variables** in your Vercel project settings → Environment Variables:

   | Name | Value |
   | --- | --- |
   | `POSTHOG_API_KEY` (or `POSTHOG_PROJECT_API_KEY`) | Your PostHog Project API Key (the same one you use in the Pasture UI) |
   | `POSTHOG_HOST` (or `NEXT_PUBLIC_POSTHOG_HOST`) | `https://us.i.posthog.com` or `https://eu.i.posthog.com` |
   | `CRON_SECRET` | A random string — Vercel auto-injects this on cron requests |

3. **Redeploy.** The cron will fire on the schedule in `vercel.json`.

> Vercel's Hobby plan supports daily granularity (one fixed time per day, UTC). The default in `vercel.json` is `0 14 * * *` (14:00 UTC). Edit it to taste.

## Configuring the run

The cron's defaults live in [`config.ts`](./config.ts) — change `flowIds`, `userCount`, `profilePreset`, `flagMode`, and `timingMode` there. These are completely separate from the Journeys page UI, so adjusting the cron won't affect interactive runs.

## Disabling

- Temporary: remove the env vars (the route returns a 500 without them).
- Permanent: delete `vercel.json` or remove the `/api/cron/journeys` entry from its `crons` array.

## Manual trigger / sanity check

The endpoint is `GET /api/cron/journeys` and requires `Authorization: Bearer <CRON_SECRET>`. You can hit it from the command line:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://your-pasture-deploy.vercel.app/api/cron/journeys
```

A successful response looks like:

```json
{
  "ok": true,
  "ranAt": "2026-05-04T14:00:00.000Z",
  "totalUsers": 50,
  "totalEvents": 387,
  "flowCounts": { "shopper": 10, "window_shopper": 10, "new_signup": 10, "search_and_browse": 10, "checkout_abandon": 10 },
  "eventCounts": { "$identify": 50, "$set": 50, "pasture_user_logged_in": 40, "...": "..." }
}
```

## Other hosts

If you don't deploy on Vercel, ignore `vercel.json` and trigger the same endpoint from any external scheduler (GitHub Actions cron, cron-job.org, EasyCron, an internal cron server, etc.). It's a plain authenticated `GET` — anything that can make an HTTP request on a schedule will work.
