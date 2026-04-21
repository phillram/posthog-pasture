# PostHog Pasture 🦔

An interactive sandbox for exploring and testing the [PostHog](https://posthog.com) JavaScript SDK. Connect your PostHog project, fire events, toggle feature flags, trigger surveys, and inspect everything in real time — all from a single dashboard.

> **Debug mode is always enabled.** All PostHog SDK activity is logged to the browser console automatically.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4 |
| Analytics | posthog-js |
| Language | TypeScript 5 |
| Linting | ESLint 9 with eslint-config-next |

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- A PostHog account with a **Project API Key** — find it in PostHog → Settings → Project API Key

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

## Setup & Authentication

### 1. Connect PostHog

On first load you'll land on the **Setup** page (`/`):

1. Paste your PostHog **Project API Key** (`phc_...`)
2. Select your **API host** — US Cloud or EU Cloud
3. Click **Connect & Continue**

The SDK initializes immediately and your key is stored in `localStorage`. It is never sent anywhere except PostHog's ingestion endpoints.

### 2. Log In

The app uses a simple local auth system to generate realistic PostHog identity events.

| Method | How | PostHog events fired |
|--------|-----|----------------------|
| **Login** | Any username + password `test` | `user_logged_in`, `$feature_flag_called` (per flag) |
| **Guest** | Click "Continue as Guest" | `user_logged_in`, `$feature_flag_called` (per flag) |
| **Register** | Name + email + any password | `user_registered`, then `posthog.identify()` |

- `$feature_flag_called` events are fired once on every login (known and guest) by reloading feature flags immediately after authentication.
- Logged-in (non-guest) users are automatically identified via `posthog.identify()`.

---

## Pages

### Setup (`/`)

Enter your PostHog Project API Key and select your API host to initialize the SDK. Redirects to `/login` on success.

---

### Login (`/login`) · Register (`/register`)

Simple auth forms. Login accepts any username with password `test`. Register sets name and email as person properties via `posthog.identify()`.

---

### Dashboard (`/dashboard`)

The main workspace for firing events. Organized into sections:

#### Quick Events
One-click buttons for the most common event types. Hover any button to see the exact event name and JSON payload. Groups:
- **Event Tracking** — Button Clicked, Page Viewed, Feature Used, Purchase, Form Submitted, Sign Up Started, Search, Capture Pageview
- **Error Tracking** — Error Occurred (`$exception`)
- **Session Replay** — Start / Stop Recording

#### Product Analytics
- **Custom Event** — Send any event name with a freeform JSON properties payload
- **Super Properties** — Register properties that attach to every subsequent event. Includes register, unregister by key, and "Show Active Super Properties" to inspect current state

#### Error Tracking
- **Custom Exception** — Build a `$exception` event with message, error type (TypeError, ReferenceError, etc.), source file, and line number
- Toggle **"Throw real JS error"** to generate a genuine stack trace
- **Quick Trigger Error** — One-click test exception

#### Feature Flags
- View all flags loaded from your PostHog project
- **Activate / Deactivate** boolean flags, **Switch** multivariate variants — all via client-side overrides
- **Reload Flags** / **Clear Overrides**

#### Experiments
- Manually override any flag key to a specific value
- **Quick Override** — click any loaded flag to cycle its value
- **Clear All** — remove all experiment overrides

#### Surveys
- **Load All Surveys** — fetch every survey in your project
- **Matching Only** — fetch only surveys that match the current user
- **Trigger** — render a popover survey directly on the page
- Each survey shows type, question count, description, and expandable question list

#### People & Groups
- **Identify User** — link the session to a distinct ID with optional JSON properties
- **Reset** — generate a new anonymous `distinct_id`
- **Group Identify** — associate the user with a group (company, project, etc). "Check" shows current group associations inline
- **Person Properties** — set properties on the current person without re-identifying

#### Sandboxes
- **JavaScript Sandbox** — run arbitrary JS expressions. Results captured as events; errors captured as exceptions. Quick snippets: User Agent, Screen size, Performance, Cookies, localStorage, Timezone, and more
- **PostHog Console** — run any `posthog-js` command like a browser console (`Cmd+Enter` to execute). Includes quick command buttons, a full command reference with documentation links, and scrollable command history with "Reuse"

---

### Event Log (`/event-log`)

A live feed of every action captured during the session: events, identify calls, flag evaluations, config changes, and more. Each entry shows:
- **Type badge** — color-coded: event, identify, pageview, group, error, config, person, flag, recording
- **Timestamp**
- **Event name**
- **Expandable JSON properties**

---

### Event Reference (`/events`)

A complete SDK reference organized by category. Each entry has a description, code example, and a **"Fire Event"** button to send a live demo event.

| Category | Methods covered |
|----------|----------------|
| Custom Events | `capture`, `capture with $set`, `capture with $set_once` |
| Page & Screen | `$pageview`, `$pageleave`, `$screen` |
| Identification | `identify`, `alias`, `reset` |
| Person Properties | `setPersonProperties`, `setPersonPropertiesForFlags` |
| Groups | `group` |
| Super Properties | `register`, `register_once`, `unregister` |
| Errors & Exceptions | `$exception` |
| Feature Flags | `isFeatureEnabled`, `getFeatureFlag`, `reloadFeatureFlags`, `$feature_flag_called` |
| Session Recording | `startSessionRecording`, `stopSessionRecording` |
| Opt In / Opt Out | `opt_in_capturing`, `opt_out_capturing`, `has_opted_out_capturing` |

---

### Flags & Experiments (`/flags`)

A dedicated page for exploring PostHog feature flags with live hedgehog GIF demos.

#### Hedgehog Feature Flags

Three demo flags — set them up in your PostHog project to see the hedgehogs come alive:

| Flag | Type | Values | Effect |
|------|------|--------|--------|
| `hog-spin` | Boolean | `true` / `false` | Shows a spinning hedgehog when enabled |
| `hog-dance` | Multivariate | `sonic`, `cgi`, `triple` | Each variant shows a different dancing hedgehog |
| `hog-action` | Multivariate | `run`, `sleep`, `swim` | Hedgehog running, sleeping, or swimming |

- Uses `posthog.onFeatureFlags()` to wait for flags before rendering
- Uses `posthog.getFeatureFlag()` for evaluation (automatically fires `$feature_flag_called`)
- Click variant buttons to override values client-side; GIFs update instantly

#### Feature Flags panel
- All project flags with Enabled / Disabled / variant badges
- Activate / Deactivate boolean flags or Switch multivariate flags
- Reload from server or Clear All Overrides

#### Flags Applied to You
- Active flags for the current session shown as green badges

---

### Config (`/config`)

Manage your PostHog connection and runtime settings.

| Section | Options |
|---------|---------|
| **Connection** | View status · Change API key · Switch US / EU cloud |
| **Capture Settings** | Autocapture · Pageview capture · Pageleave capture · Disable Session Recording |
| **Privacy & Consent** | Opt in / Opt out of event capturing |
| **Danger Zone** | Reset person data (new anonymous ID) · Full reset (disconnect, clear all settings) |

> Changes to capture settings require re-initialization (Save & Reconnect).

---

## Data & Privacy

All configuration (API key, host, settings) and user session data is stored in **`localStorage`** in the browser. Nothing is persisted on any server. Your API key is only ever sent to PostHog's ingestion endpoints.
