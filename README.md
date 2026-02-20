# PostHog Pasture

An interactive pasture for exploring and testing the [PostHog](https://posthog.com) JavaScript SDK. Connect your PostHog project, fire events, toggle feature flags, trigger surveys, and inspect everything in real time — all from a single dashboard.

Built with Next.js 16, React 19, Tailwind CSS 4, and posthog-js.

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- A PostHog account with a **Project API Key** (find it in PostHog → Settings → Project API Key)

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Run the development server

```bash
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### 3. Build for production

```bash
npm run build
npm start
```

### 4. Lint

```bash
npm run lint
```

## Setup & Login

When you first open the app, you'll land on the **Setup** page:

1. **Enter your PostHog Project API Key** — paste the key that starts with `phc_...`
2. **Select your API host** — choose US Cloud or EU Cloud depending on where your PostHog instance is hosted
3. Click **Connect & Continue** — this initializes the PostHog SDK and stores your key locally in the browser (it is never sent anywhere except PostHog)

You'll then be redirected to the **Login** page:

- Enter any username (or email) with the password **`test`** to log in. No real registration is needed — the app uses a simple local auth system for generating PostHog identify/person events.
- Alternatively, click **Continue as Guest** to skip identification.
- You can also click **Register** to create an account with a name, email, and password — this sends a `user_registered` event and sets person properties via `posthog.identify()`.

## Pages & Features

### Dashboard (`/dashboard`)

The main workspace, organized into product-aligned sections:

#### Quick Events
One-click buttons for firing common events instantly. Hover over any button to see the exact event name and JSON payload that will be sent. Includes:
- **Event Tracking** — Button Clicked, Page Viewed, Feature Used, Item Purchased, Form Submitted, Sign Up Started, Search Performed, Capture Pageview
- **Error Tracking** — Error Occurred (sends a `$exception` event)
- **Session Replay** — Start Recording, Stop Recording

#### Product Analytics
- **Custom Event** — Send any event name with a custom JSON properties payload
- **Super Properties** — Register properties that are automatically attached to every subsequent event. Includes register, unregister, and a "Show Active Super Properties" button to inspect what's currently set

#### Error Tracking
- **Custom Exception** — Build a detailed `$exception` event with message, error type (TypeError, ReferenceError, etc.), source file, and line number. Toggle "Throw real JS error" to include a real stack trace
- **Quick Trigger Error** — One-click button to fire a test exception

#### Feature Flags
- **Reload Flags** — Fetch the latest feature flag values from your PostHog project
- **Activate/Deactivate** — Toggle boolean flags on and off using client-side overrides
- **Switch** — Cycle multivariate flag values between variants (e.g., control/test)
- **Clear Overrides** — Remove all local flag overrides and reload from the server

#### Experiments
- **Override Flag** — Manually set a flag key to any value to simulate experiment variants
- **Quick Override** — Click any loaded flag to cycle its value
- **Clear All** — Remove all experiment overrides

#### Surveys
- **Load All Surveys** — Fetch every survey configured in your PostHog project
- **Matching Only** — Fetch only surveys that match the current user
- **Trigger** — Render a popover survey directly on the page
- Each survey shows its name, type, question count, description, and expandable question list

#### People & Groups
- **Identify User** — Link the current session to a distinct ID with optional JSON properties
- **Reset** — Generate a new anonymous distinct_id (useful for testing as a new user)
- **Group Identify** — Associate the current user with a group (e.g., company, project). Click "Check" to inspect current group associations inline
- **Person Properties** — Set properties on the current person

#### Sandboxes
- **JavaScript Sandbox** — Run arbitrary JavaScript expressions. Results are captured as events; errors are captured as exceptions. Includes quick snippets for User Agent, Screen size, Performance, Cookies, localStorage keys, timezone, and more
- **PostHog Console** — Run any `posthog-js` command directly (like a browser console). Supports `Cmd+Enter` to execute. Includes:
  - Quick command buttons for all common PostHog methods
  - Expandable command reference with documentation links
  - Scrollable command history with "Reuse" buttons

### Event Log (`/event-log`)

A dedicated page showing every event, identification, flag evaluation, and config change that has occurred during your session. Each entry shows:
- Color-coded type badge (event, identify, pageview, group, error, config, person, flag, recording)
- Timestamp
- Event name
- Expandable JSON properties

### Event Reference (`/events`)

A complete reference guide to every PostHog event type and SDK method, organized by category:
- Custom Events (`capture`, `capture with $set`, `capture with $set_once`)
- Page & Screen Events (`$pageview`, `$pageleave`, `$screen`)
- Identification (`identify`, `alias`, `reset`)
- Person Properties (`setPersonProperties`, `setPersonPropertiesForFlags`)
- Groups (`group`)
- Super Properties (`register`, `register_once`, `unregister`)
- Errors & Exceptions (`$exception`)
- Feature Flags (`isFeatureEnabled`, `getFeatureFlag`, `reloadFeatureFlags`, `$feature_flag_called`)
- Session Recording (`startSessionRecording`, `stopSessionRecording`)
- Opt In / Opt Out (`opt_in_capturing`, `opt_out_capturing`, `has_opted_out_capturing`)

Each entry includes a description, code example, and a "Fire Event" button to send a demo event.

### Flags & Experiments (`/flags`)

A dedicated page for exploring PostHog feature flags with live hedgehog GIF demos.

#### Hedgehog Feature Flags

Three demo flags that each display a different hedgehog GIF based on their value:

| Flag | Type | Values | Description |
|------|------|--------|-------------|
| `hog-spin` | Boolean | `true` / `false` | Shows a spinning hedgehog when enabled |
| `hog-dance` | Multivariate | `sonic`, `cgi`, `triple` | Each variant shows a different dancing hedgehog |
| `hog-action` | Multivariate | `run`, `sleep`, `swim` | Each variant shows a hedgehog running, sleeping, or swimming |

- Click variant buttons to override flag values client-side
- GIFs update instantly to reflect the active variant
- Uses `posthog.onFeatureFlags()` to wait for flags before rendering
- Uses `posthog.getFeatureFlag()` and `posthog.isFeatureEnabled()` for evaluation

#### Feature Flags
- View all flags from your PostHog project with Enabled/Disabled badges
- Activate/Deactivate boolean flags or Switch multivariate flags
- Reload Flags from the server or Clear All Overrides

#### Flags Applied to You
- Shows only flags currently active for your session as green badges

#### Apply Changes
- Reload the page to apply flag changes across the app

### Config (`/config`)

Manage your PostHog connection and SDK settings:
- **Connection** — View status, change API key, switch between US/EU cloud
- **Capture Settings** — Toggle autocapture, pageview capture, pageleave capture, debug mode, and session recording on/off. Changes require re-initialization
- **Privacy & Consent** — Opt in or opt out of event capturing
- **Danger Zone** — Reset person data (new anonymous ID) or full reset (disconnect PostHog, clear all settings)

## How Data is Stored

All configuration (API key, host, settings) and user session data is stored in **localStorage** in the browser. Nothing is persisted on a server. Your API key is only sent to PostHog's ingestion endpoints.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4 |
| Analytics | posthog-js |
| Language | TypeScript 5 |
| Linting | ESLint 9 with eslint-config-next |
