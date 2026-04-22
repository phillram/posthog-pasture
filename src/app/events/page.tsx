"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { usePosthog } from "@/contexts/PosthogContext";
import Navbar from "@/components/Navbar";
import ToastStack from "@/components/ToastStack";
import { useToast } from "@/hooks/useToast";

import HedgehogGif from "@/components/HedgehogGif";

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
        description:
          "Send any custom event with optional properties. This is the most flexible event type — use it for tracking user actions, feature usage, conversions, etc.",
        code: `posthog.capture('event_name', {\n  property_key: 'value',\n  numeric_prop: 42\n})`,
        properties: { action: "demo_capture", source: "event_reference" },
      },
      {
        name: "capture with $set",
        description:
          "Capture an event while also setting person properties in the same call. The $set properties persist on the person.",
        code: `posthog.capture('event_name', {\n  $set: { plan: 'premium', role: 'admin' }\n})`,
        properties: { $set: { demo_property: "set_via_event" } },
      },
      {
        name: "capture with $set_once",
        description:
          "Like $set, but only sets properties if they haven't been set before. Useful for first-touch attribution.",
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
        description:
          "Track page views. Automatically captured if capture_pageview is enabled, but can also be sent manually for SPAs.",
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
        description:
          "Link the current anonymous user to a known distinct_id. All future events will use this ID. Pass person properties as the second argument.",
        code: `posthog.identify('user_123', {\n  email: 'user@example.com',\n  name: 'Jane Doe'\n})`,
      },
      {
        name: "alias",
        description:
          "Create an alias between two distinct IDs. Useful when you want to link a user across different systems.",
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
        description:
          "Set properties on the current person. These persist and are visible in the PostHog People section.",
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
        description:
          "Associate the current user with a group. Groups allow analyzing at the organization/team level rather than individual.",
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
        description:
          "Register super properties that are sent with every subsequent event. Useful for context like app version.",
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
        description:
          "Capture exceptions/errors. PostHog requires $exception_list (array of exception objects). Each entry needs type, value, and mechanism fields.",
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
        description:
          "Manually start a session recording. Useful when you want to control exactly when recording begins.",
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
  Identification: "border-accent/30",
  "Person Properties": "border-accent/30",
  Groups: "border-warning/30",
  "Super Properties": "border-primary/30",
  "Errors & Exceptions": "border-error/30",
  "Feature Flags": "border-warning/30",
  "Session Recording": "border-success/30",
  "Opt In / Opt Out": "border-muted/30",
};

export default function EventsPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const { captureEvent, captureException, registerSuperProperties, unregisterSuperProperty, addLog, isInitialized } =
    usePosthog();
  const router = useRouter();

  // Custom event form
  const [customEventName, setCustomEventName] = useState("button_clicked");
  const [customEventProps, setCustomEventProps] = useState(
    JSON.stringify(
      { button_name: "signup_cta", page: "pricing", variant: "B", timestamp: new Date().toISOString() },
      null,
      2
    )
  );

  // Super properties form
  const [superProps, setSuperProps] = useState('{"app_version": "1.0.0"}');
  const [superKeyToRemove, setSuperKeyToRemove] = useState("");
  const [activeSuperProps, setActiveSuperProps] = useState<Record<string, unknown> | null>(null);

  const { toasts, showToast } = useToast();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) return null;

  const handleCustomEvent = () => {
    if (!customEventName.trim()) return;
    const name = customEventName.trim();
    try {
      const props = JSON.parse(customEventProps);
      captureEvent(name, props);
    } catch {
      captureEvent(name);
    }
    showToast(`Event "${name}" captured`);
  };

  const handleSuperProps = () => {
    try {
      const props = JSON.parse(superProps);
      registerSuperProperties(props);
      showToast("Super properties registered");
    } catch {
      showToast("Invalid JSON", "error");
    }
  };

  const handleFireEvent = (event: EventTypeInfo["events"][0]) => {
    if (event.properties && "__use_capture_exception" in event.properties) {
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Events</h1>
            <p className="text-muted text-sm mt-1">
              Fire custom events, register super properties, and browse the complete PostHog event reference.
            </p>
          </div>
          <HedgehogGif index={5} size="sm" />
        </div>

        {!isInitialized && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 text-warning text-sm">
            PostHog is not connected. Events will be logged locally but not sent.{" "}
            <button onClick={() => router.push("/")} className="underline font-medium">
              Set up your API key
            </button>
          </div>
        )}

        {/* ── Event Tracking ── */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 bg-primary rounded-full" />
            <h2 className="text-lg font-semibold text-foreground">Event Tracking</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Custom Event */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="text-base font-semibold text-foreground mb-3">Custom Event</h3>
              <p className="text-muted text-xs mb-3">Send any custom event with optional JSON properties.</p>
              <div className="space-y-3">
                <input
                  type="text"
                  value={customEventName}
                  onChange={(e) => setCustomEventName(e.target.value)}
                  placeholder="event_name"
                  className="w-full px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary text-sm font-mono"
                />
                <textarea
                  value={customEventProps}
                  onChange={(e) => setCustomEventProps(e.target.value)}
                  placeholder='{"key": "value"}'
                  rows={3}
                  className="w-full px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary text-sm font-mono"
                />
                <button
                  onClick={handleCustomEvent}
                  className="w-full py-2.5 bg-primary hover:bg-primary-hover text-white font-medium rounded-lg transition-colors text-sm"
                >
                  Capture Event
                </button>
              </div>
            </div>

            {/* Super Properties */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="text-base font-semibold text-foreground mb-3">Super Properties</h3>
              <p className="text-muted text-xs mb-3">Register properties that get sent with every subsequent event.</p>
              <div className="space-y-3">
                <textarea
                  value={superProps}
                  onChange={(e) => setSuperProps(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary text-sm font-mono"
                />
                <button
                  onClick={handleSuperProps}
                  className="w-full py-2.5 bg-primary hover:bg-primary-hover text-white font-medium rounded-lg transition-colors text-sm"
                >
                  Register Super Properties
                </button>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={superKeyToRemove}
                    onChange={(e) => setSuperKeyToRemove(e.target.value)}
                    placeholder="key_to_remove"
                    className="flex-1 px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-error text-sm font-mono"
                  />
                  <button
                    onClick={() => {
                      if (superKeyToRemove.trim()) {
                        unregisterSuperProperty(superKeyToRemove);
                        showToast(`Super property "${superKeyToRemove}" removed`, "info");
                        setSuperKeyToRemove("");
                        setActiveSuperProps(null);
                      }
                    }}
                    className="py-2.5 px-4 bg-error/20 hover:bg-error/30 text-error font-medium rounded-lg transition-colors text-sm"
                  >
                    Unregister
                  </button>
                </div>
                <button
                  onClick={async () => {
                    const ph = (await import("posthog-js")).default;
                    const props = ph.persistence?.properties() || {};
                    // Filter out internal PostHog properties (start with $)
                    const userProps: Record<string, unknown> = {};
                    for (const [k, v] of Object.entries(props)) {
                      if (!k.startsWith("$") && !k.startsWith("__") && k !== "distinct_id" && k !== "token") {
                        userProps[k] = v;
                      }
                    }
                    setActiveSuperProps(userProps);
                    addLog({ type: "config", name: "Active Super Properties Viewed", properties: userProps });
                    showToast(`${Object.keys(userProps).length} super properties found`);
                  }}
                  className="w-full py-2.5 bg-primary/20 hover:bg-primary/30 text-primary font-medium rounded-lg transition-colors text-sm"
                >
                  Show Active Super Properties
                </button>
                {activeSuperProps && (
                  <div className="bg-input-bg border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-muted">Active Super Properties</p>
                      <button
                        onClick={() => setActiveSuperProps(null)}
                        className="text-xs text-muted hover:text-foreground transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                    {Object.keys(activeSuperProps).length > 0 ? (
                      <pre className="text-xs font-mono text-foreground/80 overflow-x-auto">
                        {JSON.stringify(activeSuperProps, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-xs text-muted">No user-defined super properties registered.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── Event Reference ── */}
        <div className="pt-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 bg-accent rounded-full" />
            <h2 className="text-lg font-semibold text-foreground">Event Reference</h2>
          </div>
          <p className="text-muted text-sm mb-4">
            Complete guide to every PostHog event type. Click a category below to expand it, then &quot;Fire Event&quot;
            to send a demo event.
          </p>
        </div>

        {eventTypes.map((category) => (
          <details
            key={category.category}
            className={`group bg-card border-l-4 ${categoryColors[category.category] || "border-border"} border border-border rounded-xl overflow-hidden`}
          >
            <summary className="flex items-center justify-between cursor-pointer select-none p-6 hover:bg-input-bg/40 transition-colors list-none">
              <div className="flex items-center gap-3">
                <span className="text-muted text-sm transition-transform group-open:rotate-90">▸</span>
                <h2 className="text-xl font-semibold text-foreground">{category.category}</h2>
                <span className="text-xs text-muted">
                  {category.events.length} method{category.events.length !== 1 ? "s" : ""}
                </span>
              </div>
              <span className="text-xs text-muted group-open:hidden">Click to expand</span>
            </summary>
            <div className="px-6 pb-6 space-y-6 border-t border-border/50 pt-4">
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
          </details>
        ))}
      </main>

      <ToastStack toasts={toasts} />
    </div>
  );
}
