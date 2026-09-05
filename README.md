# PostHog Pasture 🦔

An interactive sandbox for exploring and testing [PostHog](https://posthog.com). Connect your PostHog project, fire events, toggle feature flags, trigger surveys, generate experiment data, and inspect everything in real time.

Custom events fired from Pasture all start with `pasture_` (e.g. `pasture_purchase`, `pasture_user_logged_in`) so you can easily tell them apart from the rest of your project's events in PostHog.

## Tech Stack

| Layer     | Technology               |
| --------- | ------------------------ |
| Framework | Next.js 16 (App Router)  |
| UI        | React 19, Tailwind CSS 4 |
| Analytics | posthog-js               |
| Language  | TypeScript 5             |

---

## Prerequisites

- [Node.js](https://nodejs.org/) v20 or later
- A PostHog account with a Project API Key — find it in PostHog → Settings → Project Details

---

## Getting Started

```bash
# Install dependencies
npm install

# Start the development server (http://localhost:3000)
npm run dev

# Build and start for production
npm run build
npm start
```

### Checks

```bash
npm run lint       # ESLint, with the Next.js config
npm run typecheck  # tsc --noEmit
npm test           # Vitest, over the pure modules in src/lib
```

---

## Setup & Login

On first load you land on the Setup page. Paste your Project API Key, choose your API host (US Cloud, EU Cloud, or your own self-hosted instance or reverse proxy), and click Connect & Continue.

Then log in with any username + password `test`, continue as a guest, or register a new account. Registration and login both have an "Apply feature flags" toggle — turn it on if you want flag evaluations to be logged at login.

> API Key locations:
>
> - US: https://us.posthog.com/settings/project-details
> - EU: https://eu.posthog.com/settings/project-details

---

## Pages

Each page is themed in its own colour so you can see at a glance which area you're in: Identify purple, Events orange, Errors red, Flags green, Experiments yellow, Journeys brown, Surveys pink, Sandboxes cyan. The Event Log uses the same palette so each entry's badge matches the area it came from.

### Dashboard

The main workspace. Two sections:

- **Quick Events** — one-click buttons that fire common event types (purchase, signup, error, pageview, session recording start/stop, etc.). Hover any button for a tooltip showing what it sends.
- **Sandboxes** — run arbitrary JavaScript in an expression sandbox, or run any PostHog SDK command from an in-page console with quick-command buttons and a reusable history. The JS sandbox sends the code you ran to PostHog. Sending the *result* is a separate toggle, off by default, because an expression can read cookies or localStorage.

### Identify

A Your PostHog Profile panel at the top shows your distinct ID, device ID, and session ID, whether you're identified or anonymous, your active groups, the person properties you've set, and any super properties stored locally. Long sections collapse so the panel stays compact. A Refresh button re-reads everything, and the panel also auto-refreshes whenever you submit one of the cards below.

Below the profile, manage who you are to PostHog: identify the current user with a distinct ID, reset back to anonymous, associate the user with a group (e.g. pasture or company), and set person properties on the fly. If your PostHog plan doesn't include group analytics, the Group Identify card surfaces the server's error inline.

### Events

Two sections:

- **Event Tracking** — send any custom event name with freeform JSON properties, and manage super properties (register, unregister, inspect).
- **Event Reference** — a browsable catalogue of every PostHog event type, grouped into collapsible categories. Each entry has a description, a code example, and a Fire Event button to send a live demo. Demo events are named `pasture_demo_*` so they never mix with your real event names, and the Groups entry calls `posthog.group()` rather than sending an event.

### Errors

Build and capture custom exceptions. Pick a message, error type, source file, and line number — or flip "Throw real JS error" on to send a genuine stack trace. A Quick Trigger Error button sends a one-click test exception. The Quick Fire Errors panel lets you fire a chosen preset (or a random mix) multiple times in one go using a count selector.

### Flags

Explore the feature flags from your PostHog project.

Three demo flags drive live hedgehog GIF animations — set them up in PostHog to see it in action:

| Flag         | Type         | Values                   | Effect                                          |
| ------------ | ------------ | ------------------------ | ----------------------------------------------- |
| `hog-spin`   | Boolean      | `true` / `false`         | Shows a spinning hedgehog when enabled          |
| `hog-dance`  | Multivariate | `sonic`, `cgi`, `triple` | Each variant shows a different dancing hedgehog |
| `hog-action` | Multivariate | `run`, `sleep`, `swim`   | Hedgehog running, sleeping, or swimming         |

All project flags are also listed with their current values. You can activate / deactivate boolean flags, switch multivariate variants, reload from the server, or clear all local overrides. Each row also has a Peek button that opens the flag in PostHog in a new tab.

Any flag whose value you've changed locally is highlighted with a dashed warning-coloured outline so it's clear which values came from your project and which you've changed yourself. Hover over a highlighted pill to confirm it's an override. Clear Overrides wipes those markers along with the local values.

If the flag list stays empty after a few seconds, an ad blocker or privacy extension is most likely blocking the request — the Event Log will surface an error explaining what happened.

### Experiments

A wizard that generates realistic experiment data in your PostHog project using simulated users. Each simulated user gets their own distinct ID so your own session is never affected.

Walk through five steps: pick a feature flag, choose how many simulated users to generate, set the conversion rates, pick a conversion action, and choose an event-timing spread (Burst through Past 30 days) so trend lines look natural rather than spiking at the moment of the run.

Conversion takes two numbers: a baseline for the control variant, and a lift for the test variants. Control at 20% with a +25% lift gives a test variant that converts at 25%, so PostHog has a real difference to measure. Set the lift to 0% for a deliberate null result, or below 0% for a test variant that loses.

Every simulated person is identified with a full profile (name, email, country, signup date, plan tier) and tagged with a `pasture_experiment: true` person property so you can filter for users created by this page in PostHog. The plan tier is randomised per user so a run produces a realistic mix of personas.

The results view shows totals, conversion rate, a per-variant breakdown that marks the control and each variant's lift against it, and a table of every simulated user with their assigned variant and conversion status. Two links go to PostHog: the experiments dashboard, and the person list filtered to the users this page created, which is how you clean them up afterwards.

### Journeys

Simulate end-to-end user journeys in your PostHog project. Pick how many simulated users you want, choose one or more of eight pre-built flows (Shopper, Window Shopper, New Signup, Search & Browse, Checkout Abandon, Feature Explorer, Support Ticket, Power User), and pick a person profile preset (Casual, Power User, Enterprise).

Each simulated user gets a randomly-generated identity, has feature flags fetched for them, and runs the full flow — login, profile properties, page views, the journey-specific actions, and logout — so you'll see realistic funnels and paths in PostHog. With multiple flows selected, users are split across them. Your own session is never touched.

Every simulated person is identified with the same full profile shape used by Experiments (name, email, country, signup date, plan tier) and tagged with a `pasture_journey: true` person property so you can filter for users created by this page in PostHog.

An **Event timing** picker controls how event timestamps are spread. Burst keeps every event close to "now" with tiny gaps (good for a quick test). Past hour, Past day, Past 5 / 10 / 15 / 30 days each start the session somewhere inside that window and spread the events across an uneven set of gaps, so trend lines and funnels show natural curves instead of one tall spike. Every timestamp lands at or before now, whatever the flow length or flag count, because PostHog rejects timestamps far in the future.

The results view shows total users, total events sent, a flow breakdown, a per-event tally, and a per-user table. A "View these persons in PostHog →" link opens the person list filtered to `pasture_journey`, which is also how you remove the data a run created.

Every event from one simulated user shares a `$session_id`, so PostHog reads the journey as one session.

### Surveys

Auto-loads the surveys from your PostHog project on arrival. By default only Running surveys are shown, grouped by status and sorted alphabetically inside each group. Flip "Show all statuses" to also see drafts, scheduled, and completed surveys. A status breakdown across the top shows how many of each you have. Reload Surveys refetches from PostHog.

Each survey card shows its name with a coloured status badge (Draft / Running / Complete) and:

- **Trigger** — for popover surveys, render the survey as it would appear in a real in-product popover
- For API-type surveys, a full inline form (open text, ratings, single/multi choice, links) with a Submit button
- An expandable **Targeting conditions** panel showing the URL, selector, events, and linked flag that control when the survey matches

Submitting the inline form sends a `survey shown` event and then a `survey sent` event, both with the same `$survey_submission_id`, and keys each answer the way PostHog reads it. The answers show up in the survey's results in PostHog.

### Event Log

A live feed of events captured during your session — identifications, person and group properties, exceptions, feature flags, and any custom events you fire from the app. Each entry shows a colour-coded type badge, timestamp, event name, and a property count. Rows start collapsed; click a row to expand its full properties and click again to collapse. The log is capped at the most recent 100 entries and persists across page navigation and refreshes within the same browser tab. Some automatically captured events are kept out of the log to reduce noise — they're still sent to PostHog as normal.

Filter by type, search by name or properties, export with Copy JSON or Download JSON, or empty the log with Clear Log.

### Config

- **Connection** — view status, change API key, switch between US Cloud, EU Cloud, and a custom host, save & reconnect
- **Capture Settings** — toggle autocapture, pageview capture, pageleave capture, session recording
- **Privacy & Consent** — opt in / opt out of event capturing
- **Danger Zone** — reset person data (new anonymous ID) or a full reset that disconnects and clears everything

> Capture Settings apply the moment you flip them. Changing the API key or host reloads the page, because posthog-js cannot repoint a loaded SDK at a different project.

---

## Navigation

Setup → Login / Register → Dashboard → Identify → Events → Errors → Flags → Experiments → Journeys → Surveys → Event Log → Config

---

## Data & Privacy

All configuration and session data is kept locally in your browser. Nothing is persisted on any server; your API key is only ever sent to PostHog.

---

## Optional: daily journey cron (power users only)

A scheduled task can fire a journey run once a day so your PostHog project stays continuously populated without anyone clicking the Journeys page button. **It is entirely optional** and does not affect day-to-day usage of Pasture — if you don't set it up, nothing changes.

It lives in its own folder, separate from the page UI: [`src/app/api/cron/journeys/`](./src/app/api/cron/journeys/README.md). The README in that folder has the full setup steps (Vercel env vars, schedule format, manual-trigger curl, how to disable). Short version: deploy on Vercel, set `POSTHOG_API_KEY` / `POSTHOG_HOST` / `CRON_SECRET` in your project's env vars, redeploy.
