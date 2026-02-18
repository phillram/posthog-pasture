"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { usePosthog } from "@/contexts/PosthogContext";
import Navbar from "@/components/Navbar";

import { HedgehogBanner } from "@/components/HedgehogGif";

interface EventTypeInfo {
  category: string;
  events: {
    name: string;
    description: string;
    code: string;
    properties?: Record<string, unknown>;
  }[];
}

const eventTypes: EventTypeInfo[] = [
  {
    category: "Custom Events",
    events: [
      {
        name: "capture",
        description: "Send any custom event with optional properties. This is the most flexible event type — use it for tracking user actions, feature usage, conversions, etc.",
        code: `posthog.capture('event_name', {\n  property_key: 'value',\n  numeric_prop: 42\n})`,
        properties: { action: "demo_capture", source: "event_reference" },
      },
      {
        name: "capture with $set",
        description: "Capture an event while also setting person properties in the same call. The $set properties persist on the person.",
        code: `posthog.capture('event_name', {\n  $set: { plan: 'premium', role: 'admin' }\n})`,
        properties: { $set: { demo_property: "set_via_event" } },
      },
      {
        name: "capture with $set_once",
        description: "Like $set, but only sets properties if they haven't been set before. Useful for first-touch attribution.",
        code: `posthog.capture('event_name', {\n  $set_once: { initial_referrer: 'google.com' }\n})`,
        properties: { $set_once: { first_seen_page: "event_reference" } },
      },
    ],
  },
  {
    category: "Page & Screen Events",
    events: [
      {
        name: "$pageview",
        description: "Track page views. Automatically captured if capture_pageview is enabled, but can also be sent manually for SPAs.",
        code: `posthog.capture('$pageview')`,
        properties: { $current_url: "/events" },
      },
      {
        name: "$pageleave",
        description: "Track when users leave a page. Automatically captured if capture_pageleave is enabled.",
        code: `posthog.capture('$pageleave')`,
        properties: { $current_url: "/events" },
      },
      {
        name: "$screen",
        description: "Track screen views in mobile apps (or used as a virtual screen view in web SPAs).",
        code: `posthog.capture('$screen', {\n  $screen_name: 'Settings'\n})`,
        properties: { $screen_name: "Event Reference" },
      },
    ],
  },
  {
    category: "Identification",
    events: [
      {
        name: "identify",
        description: "Link the current anonymous user to a known distinct_id. All future events will use this ID. Pass person properties as the second argument.",
        code: `posthog.identify('user_123', {\n  email: 'user@example.com',\n  name: 'Jane Doe'\n})`,
      },
      {
        name: "alias",
        description: "Create an alias between two distinct IDs. Useful when you want to link a user across different systems.",
        code: `posthog.alias('new_id', 'existing_id')`,
      },
      {
        name: "reset",
        description: "Reset the current user's identity. Generates a new anonymous distinct_id. Call this on logout.",
        code: `posthog.reset()`,
      },
    ],
  },
  {
    category: "Person Properties",
    events: [
      {
        name: "setPersonProperties",
        description: "Set properties on the current person. These persist and are visible in the PostHog People section.",
        code: `posthog.setPersonProperties({\n  email: 'user@example.com',\n  plan: 'enterprise'\n})`,
      },
      {
        name: "setPersonPropertiesForFlags",
        description: "Set properties used for feature flag evaluation without persisting them as person properties.",
        code: `posthog.setPersonPropertiesForFlags({\n  beta_group: 'test'\n})`,
      },
    ],
  },
  {
    category: "Groups",
    events: [
      {
        name: "group",
        description: "Associate the current user with a group. Groups allow analyzing at the organization/team level rather than individual.",
        code: `posthog.group('company', 'company_123', {\n  name: 'Acme Corp',\n  industry: 'Tech'\n})`,
        properties: { company: "demo_company" },
      },
    ],
  },
  {
    category: "Super Properties",
    events: [
      {
        name: "register",
        description: "Register super properties that are sent with every subsequent event. Useful for context like app version.",
        code: `posthog.register({\n  app_version: '2.0.0',\n  environment: 'production'\n})`,
      },
      {
        name: "register_once",
        description: "Like register, but only sets properties if they haven't been set before.",
        code: `posthog.register_once({\n  first_visit_date: '2024-01-01'\n})`,
      },
      {
        name: "unregister",
        description: "Remove a super property so it's no longer sent with events.",
        code: `posthog.unregister('app_version')`,
      },
    ],
  },
  {
    category: "Errors & Exceptions",
    events: [
      {
        name: "$exception",
        description: "Capture exceptions/errors. PostHog requires $exception_list (array of exception objects). Each entry needs type, value, and mechanism fields.",
        code: `posthog.capture('$exception', {\n  $exception_message: 'Something broke',\n  $exception_type: 'TypeError',\n  $exception_source: 'checkout.js',\n  $exception_lineno: 42,\n  $exception_list: [{\n    type: 'TypeError',\n    value: 'Something broke',\n    mechanism: { handled: true, type: 'generic' }\n  }]\n})`,
        properties: {
          __use_capture_exception: true,
          message: "Demo exception from Event Reference",
          type: "DemoError",
          source: "event_reference_page",
        },
      },
    ],
  },
  {
    category: "Feature Flags",
    events: [
      {
        name: "isFeatureEnabled",
        description: "Check if a feature flag is enabled for the current user.",
        code: `const enabled = posthog.isFeatureEnabled('my-flag')`,
      },
      {
        name: "getFeatureFlag",
        description: "Get the value of a feature flag (for multivariate flags that return strings).",
        code: `const variant = posthog.getFeatureFlag('my-flag')`,
      },
      {
        name: "reloadFeatureFlags",
        description: "Force a reload of all feature flags from the PostHog server.",
        code: `posthog.reloadFeatureFlags()`,
      },
      {
        name: "$feature_flag_called",
        description: "Automatically captured when you evaluate a feature flag. Used for experiment result analysis.",
        code: `// Auto-captured when calling:\nposthog.isFeatureEnabled('my-flag')`,
        properties: {
          $feature_flag: "demo-flag",
          $feature_flag_response: true,
        },
      },
    ],
  },
  {
    category: "Session Recording",
    events: [
      {
        name: "startSessionRecording",
        description: "Manually start a session recording. Useful when you want to control exactly when recording begins.",
        code: `posthog.startSessionRecording()`,
      },
      {
        name: "stopSessionRecording",
        description: "Stop the current session recording.",
        code: `posthog.stopSessionRecording()`,
      },
    ],
  },
  {
    category: "Opt In / Opt Out",
    events: [
      {
        name: "opt_in_capturing",
        description: "Opt the user in to event capturing. Events will be sent to PostHog.",
        code: `posthog.opt_in_capturing()`,
      },
      {
        name: "opt_out_capturing",
        description: "Opt the user out of event capturing. No events will be sent until they opt back in.",
        code: `posthog.opt_out_capturing()`,
      },
      {
        name: "has_opted_out_capturing",
        description: "Check if the current user has opted out.",
        code: `const isOptedOut = posthog.has_opted_out_capturing()`,
      },
    ],
  },
];

const categoryColors: Record<string, string> = {
  "Custom Events": "border-primary/30",
  "Page & Screen Events": "border-success/30",
  "Identification": "border-accent/30",
  "Person Properties": "border-accent/30",
  "Groups": "border-warning/30",
  "Super Properties": "border-primary/30",
  "Errors & Exceptions": "border-error/30",
  "Feature Flags": "border-warning/30",
  "Session Recording": "border-success/30",
  "Opt In / Opt Out": "border-muted/30",
};

export default function EventsPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const { captureEvent, captureException, isInitialized } = usePosthog();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) return null;

  const handleFireEvent = (event: EventTypeInfo["events"][0]) => {
    if (event.properties && '__use_capture_exception' in event.properties) {
      captureException({
        message: event.properties.message as string,
        type: event.properties.type as string,
        source: (event.properties.source as string) || "event_reference",
      });
    } else if (event.properties) {
      captureEvent(event.name, event.properties);
    } else {
      captureEvent(event.name, { source: "event_reference", demo: true });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-5xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">PostHog Event Reference</h1>
          <p className="text-muted text-sm mt-1">
            Complete guide to every PostHog event type. Click &quot;Fire Event&quot; to send a demo event.
          </p>
        </div>

        <HedgehogBanner />

        {!isInitialized && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 text-warning text-sm">
            PostHog is not connected. Events will be logged locally but not sent. <button onClick={() => router.push("/")} className="underline font-medium">Set up your API key</button>
          </div>
        )}

        {eventTypes.map((category) => (
          <section key={category.category} className={`bg-card border-l-4 ${categoryColors[category.category] || "border-border"} border border-border rounded-xl p-6`}>
            <h2 className="text-xl font-semibold text-foreground mb-4">{category.category}</h2>
            <div className="space-y-6">
              {category.events.map((event) => (
                <div key={event.name} className="border-b border-border/50 pb-5 last:border-0 last:pb-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-primary font-mono">{event.name}</h3>
                      <p className="text-sm text-muted mt-1">{event.description}</p>
                    </div>
                    {event.properties && (
                      <button
                        onClick={() => handleFireEvent(event)}
                        className="shrink-0 py-1.5 px-4 bg-primary/20 hover:bg-primary/30 text-primary font-medium rounded-lg transition-colors text-xs"
                      >
                        Fire Event
                      </button>
                    )}
                  </div>
                  <pre className="mt-3 p-3 bg-input-bg rounded-lg text-xs font-mono text-foreground/80 overflow-x-auto">
                    {event.code}
                  </pre>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
