# PostHog Pasture 🦔

An interactive sandbox for exploring and testing [PostHog](https://posthog.com). Connect your PostHog project, fire events, toggle feature flags, trigger surveys, generate experiment data, and inspect everything in real time.

Every event fired from Pasture is automatically tagged with an **`evaluation_context`** property set to `pasture:<page>` (e.g. `pasture:dashboard`, `pasture:flags`). You can filter on this in PostHog to see exactly which page a given event came from.

## Tech Stack

| Layer     | Technology               |
| --------- | ------------------------ |
| Framework | Next.js 16 (App Router)  |
| UI        | React 19, Tailwind CSS 4 |
| Analytics | posthog-js               |
| Language  | TypeScript 5             |

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- A PostHog account with a **Project API Key** — find it in PostHog → Settings → Project Details

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

# Lint
npm run lint
```

---

## Setup & Login

On first load you land on the **Setup** page. Paste your **Project API Key**, choose your **API host** (US or EU Cloud), and click **Connect & Continue**.

Then log in with any username + password `test`, continue as a guest, or register a new account. Registration and login both have an **"Apply feature flags"** toggle — turn it on if you want flag-evaluation events to fire at login time.

> **API Key locations:**
>
> - US: https://us.posthog.com/settings/project-details
> - EU: https://eu.posthog.com/settings/project-details

---

## Pages

Each page is themed in its own colour so you can see at a glance which area you're in: **Identify** purple, **Events** orange, **Errors** red, **Flags** green, **Experiments** yellow, **Surveys** pink, **Sandboxes** cyan. The Event Log uses the same palette so each entry's badge matches the area it came from.

### Dashboard

The main workspace. Two sections:

- **Quick Events** — one-click buttons that fire common event types (purchase, signup, error, pageview, session recording start/stop, etc.). Hover any button for a tooltip showing what it sends.
- **Sandboxes** — run arbitrary JavaScript in an expression sandbox, or run any PostHog SDK command directly from an in-page console (with quick-command buttons and a reusable history).

### Identify

A **Your PostHog Profile** panel at the top shows the distinct ID, device ID, and session ID currently used by posthog-js — each on its own single line so the full value is always visible — along with whether you're identified or anonymous, your active groups, the person properties you've set on yourself, and any super properties stored locally by the SDK. The Groups, Person properties, and Stored super properties sections are collapsible and auto-collapse when they have more than five entries. A **Refresh** button re-reads everything from posthog-js, and the panel also auto-refreshes whenever you submit one of the cards below.

Below the profile, manage who you are to PostHog: identify the current user with a distinct ID, reset back to anonymous, associate the user with a group (e.g. pasture or company), and set person properties on the fly. If your PostHog plan doesn't include group analytics, the **Group Identify** card surfaces the server's error inline.

### Events

Two sections:

- **Event Tracking** — send any custom event name with freeform JSON properties, and manage super properties (register, unregister, inspect).
- **Event Reference** — a browsable catalogue of every PostHog event type, grouped into collapsible categories. Each entry has a description, a code example, and a **Fire Event** button to send a live demo.

### Errors

Build and capture custom exceptions. Pick a message, error type, source file, and line number — or flip **"Throw real JS error"** on to send a genuine stack trace. A **Quick Trigger Error** button sends a one-click test exception. The **Quick Fire Errors** panel lets you fire a chosen preset (or a random mix) multiple times in one go using a count selector.

### Flags

Explore the feature flags from your PostHog project.

Three demo flags drive live hedgehog GIF animations — set them up in PostHog to see it in action:

| Flag         | Type         | Values                   | Effect                                          |
| ------------ | ------------ | ------------------------ | ----------------------------------------------- |
| `hog-spin`   | Boolean      | `true` / `false`         | Shows a spinning hedgehog when enabled          |
| `hog-dance`  | Multivariate | `sonic`, `cgi`, `triple` | Each variant shows a different dancing hedgehog |
| `hog-action` | Multivariate | `run`, `sleep`, `swim`   | Hedgehog running, sleeping, or swimming         |

All project flags are also listed with their current values. You can activate / deactivate boolean flags, switch multivariate variants, reload from the server, or clear all local overrides. Each row also has a **Peek** button that opens the flag in PostHog in a new tab.

Any flag whose value you've changed locally is highlighted with a dashed warning-colored outline in both the *Flags Applied to You* and *All Feature Flags on Project* lists, so it's clear at a glance which values came from your project and which you've changed yourself. Hover over a highlighted pill to confirm it's an override. **Clear Overrides** wipes those markers along with the local values.

If the flag list stays empty after a few seconds, the Event Log will show a **Feature flags request failed silently** error — that means the `/flags` request was blocked or never came back. Check your browser's DevTools Network tab for the `/flags` request: an ad blocker or privacy extension is the most common cause.

### Experiments

A wizard that generates realistic experiment data in your PostHog project using simulated users. Each simulated user gets their own distinct ID so your own session is never affected.

Walk through four steps: pick a feature flag, choose how many simulated users to generate, set a conversion rate, and pick a conversion action. PostHog assigns each user their flag variant, then the wizard fires identification, flag-exposure, and conversion events in the right order.

The results view shows totals, conversion rate, a per-variant breakdown, and a table of every simulated user with their assigned variant and conversion status. There's also a direct **"View in PostHog →"** link to the experiments dashboard.

### Surveys

Auto-loads the surveys from your PostHog project on arrival. By default only **Running** surveys are shown, sorted alphabetically. Flip **"Show all statuses"** to also see drafts, scheduled, and completed surveys. A status breakdown across the top shows how many of each you have. **Reload Surveys** refetches from PostHog.

Each survey card shows its name with a coloured status badge (Draft / Scheduled / Running / Completed) and:

- **Trigger** — render the survey as it would appear in a real in-product popover
- **Dismiss** — fire a dismissal event
- For API-type surveys, a full inline form (open text, ratings, single/multi choice, links) with a Submit button
- An expandable **Targeting conditions** panel showing the URL, selector, events, and linked flag that control when the survey matches

### Event Log

A live feed of PostHog events captured during the session — identifications, person and group properties, exceptions, feature-flag-called events, and any custom events you fire from the app. Each entry shows a colour-coded type badge, timestamp, event name, and a property count. **Every row is collapsed by default — click a row to expand its full JSON properties and click again to collapse it back.** The log is capped at the most recent 100 entries and persists across page navigation and refreshes within the same browser tab. **Feature Flags Ready** is logged once on load instead of on every flag re-evaluation, so override toggles no longer add duplicate entries. To keep the log readable, autocaptured and high-frequency telemetry events (`$autocapture`, `$pageview`, `$pageleave`, `$rageclick`, `$$heatmap`, `$web_vitals`) are kept out of the log — they're still sent to PostHog as normal.

Filter by **type**, search by **name or properties**, export what you see with **Copy JSON** or **Download JSON**, or empty the log with **Clear Log** (with a confirm prompt — only the local log is cleared, events already sent to PostHog are not affected).

### Config

- **Connection** — view status, change API key, switch US / EU cloud, save & reconnect
- **Capture Settings** — toggle autocapture, pageview capture, pageleave capture, session recording
- **Privacy & Consent** — opt in / opt out of event capturing
- **Danger Zone** — reset person data (new anonymous ID) or a full reset that disconnects and clears everything

> Capture Settings changes take effect after **Save & Reconnect**.

---

## Navigation

Setup → Login / Register → Dashboard → Identify → Events → Errors → Flags → Experiments → Surveys → Event Log → Config

---

## Data & Privacy

All configuration and session data is kept locally in your browser. Nothing is persisted on any server; your API key is only ever sent to PostHog.
