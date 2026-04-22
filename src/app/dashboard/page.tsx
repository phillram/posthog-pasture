"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { usePosthog } from "@/contexts/PosthogContext";
import Navbar from "@/components/Navbar";
import ToastStack from "@/components/ToastStack";
import { useToast } from "@/hooks/useToast";
import { randomPurchaseProps } from "@/lib/purchase";

import HedgehogGif from "@/components/HedgehogGif";

export default function DashboardPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const {
    isInitialized,
    captureEvent,
    captureException,
    identifyUser,
    resetPerson,
    setPersonProperties,
    groupIdentify,
    capturePageview,
    startSessionRecording,
    stopSessionRecording,
    flagsReady,
    addLog,
  } = usePosthog();
  const router = useRouter();

  // JS Utilities form
  const [jsCode, setJsCode] = useState("document.title");
  const [jsResult, setJsResult] = useState("");

  // PostHog Console
  const [phCommand, setPhCommand] = useState("posthog.capture('test_event', { source: 'console' })");
  const [phHistory, setPhHistory] = useState<{ command: string; result: string; isError: boolean }[]>([]);

  // Identify form
  const [identifyId, setIdentifyId] = useState("");
  const [identifyProps, setIdentifyProps] = useState('{"plan": "premium"}');

  // Group form
  const [groupType, setGroupType] = useState("company");
  const [groupKey, setGroupKey] = useState("");

  // Person properties form
  const [personProps, setPersonProps] = useState('{"favorite_color": "orange"}');

  const [activeGroups, setActiveGroups] = useState<Record<string, unknown> | null>(null);

  // Toast notifications
  const { toasts, showToast } = useToast();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) return null;

  if (isInitialized && !flagsReady) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-3">
            <div className="text-5xl animate-pulse">🦔</div>
            <p className="text-muted text-sm">Loading feature flags...</p>
          </div>
        </div>
      </div>
    );
  }

  const handleIdentify = () => {
    if (!identifyId.trim()) return;
    try {
      const props = JSON.parse(identifyProps);
      identifyUser(identifyId.trim(), props);
    } catch {
      identifyUser(identifyId.trim());
    }
    showToast(`Identified as "${identifyId.trim()}"`);
  };

  const handleGroupIdentify = () => {
    if (!groupType.trim() || !groupKey.trim()) return;
    groupIdentify(groupType.trim(), groupKey.trim());
    showToast(`Group "${groupType.trim()}/${groupKey.trim()}" set`);
  };

  const handlePersonProps = () => {
    try {
      const props = JSON.parse(personProps);
      setPersonProperties(props);
      showToast("Person properties updated");
    } catch {
      showToast("Invalid JSON", "error");
    }
  };

  const handleRunJs = () => {
    if (!jsCode.trim()) return;
    try {
      const result = new Function(`return (${jsCode})`)();
      const output = typeof result === "object" ? JSON.stringify(result, null, 2) : String(result);
      setJsResult(output);
      captureEvent("pasture_js_executed", { code: jsCode, result: output, success: true });
      showToast("Code executed");
    } catch (e) {
      const errMsg = (e as Error).message;
      setJsResult(`Error: ${errMsg}`);
      captureException({
        message: errMsg,
        type: (e as Error).name,
        source: "JS Sandbox",
      });
      showToast(`JS Error: ${errMsg}`, "error");
    }
  };

  const handlePhCommand = async () => {
    if (!phCommand.trim()) return;
    try {
      const posthogMod = await import("posthog-js");
      const posthogRef = posthogMod.default;
      const fn = new Function("posthog", `return ${phCommand}`);
      const result = fn(posthogRef);
      const output =
        result === undefined
          ? "undefined"
          : typeof result === "object"
            ? JSON.stringify(result, null, 2)
            : String(result);
      setPhHistory((prev) => [{ command: phCommand, result: output, isError: false }, ...prev.slice(0, 49)]);
      addLog({ type: "event", name: "Console Command", properties: { command: phCommand, result: output } });
      showToast("Command executed");
    } catch (e) {
      setPhHistory((prev) => [
        { command: phCommand, result: (e as Error).message, isError: true },
        ...prev.slice(0, 49),
      ]);
      addLog({
        type: "error",
        name: "Console Command Error",
        properties: { command: phCommand, error: (e as Error).message },
      });
      showToast(`Error: ${(e as Error).message}`, "error");
    }
  };

  type QuickEvent = { name: string; event: string; props: Record<string, unknown>; color: string };
  type QuickEventGroup = { label: string; events: QuickEvent[] };

  const quickEventGroups: QuickEventGroup[] = [
    {
      label: "Event Tracking",
      events: [
        {
          name: "Button Clicked",
          event: "pasture_button_clicked",
          props: { button_name: "cta", page: "dashboard" },
          color: "bg-primary hover:bg-primary-hover",
        },
        {
          name: "Page Viewed",
          event: "$pageview",
          props: { $current_url: typeof window !== "undefined" ? window.location.href : "/dashboard" },
          color: "bg-success/80 hover:bg-success",
        },
        {
          name: "Feature Used",
          event: "pasture_feature_used",
          props: { feature: "analytics", duration_ms: 1234 },
          color: "bg-accent hover:bg-accent-hover",
        },
        {
          name: "Item Purchased",
          event: "pasture_purchase",
          // Props are regenerated per click in handleQuickEvent — see randomPurchaseProps().
          props: { item: "hedgehog_<random>", price: "<random 0.01–1000.00>", currency: "USD" },
          color: "bg-warning/80 hover:bg-warning",
        },
        {
          name: "Form Submitted",
          event: "pasture_form_submitted",
          props: { form_name: "contact", fields_count: 5 },
          color: "bg-blue-600 hover:bg-blue-500",
        },
        {
          name: "Sign Up Started",
          event: "pasture_signup_started",
          props: { source: "landing_page", variant: "A" },
          color: "bg-teal-600 hover:bg-teal-500",
        },
        {
          name: "Search Performed",
          event: "pasture_search",
          props: { query: "hedgehog care", results_count: 42 },
          color: "bg-pink-600 hover:bg-pink-500",
        },
        {
          name: "Capture Pageview",
          event: "__capture_pageview",
          props: {},
          color: "bg-success/60 hover:bg-success/80",
        },
      ],
    },
    {
      label: "Error Tracking",
      events: [
        {
          name: "Error Occurred",
          event: "$exception",
          props: { __use_capture_exception: true, message: "Something went wrong", type: "RuntimeError" },
          color: "bg-error/80 hover:bg-error",
        },
      ],
    },
    {
      label: "Session Replay",
      events: [
        { name: "Start Recording", event: "__start_recording", props: {}, color: "bg-success/60 hover:bg-success/80" },
        { name: "Stop Recording", event: "__stop_recording", props: {}, color: "bg-success/20 hover:bg-success/40" },
      ],
    },
  ];

  const getQuickEventTooltip = (qe: QuickEvent) => {
    if (qe.event === "__capture_pageview")
      return "Captures a $pageview event for the current URL via posthog.capture('$pageview')";
    if (qe.event === "__start_recording") return "Starts session recording via posthog.startSessionRecording()";
    if (qe.event === "__stop_recording") return "Stops session recording via posthog.stopSessionRecording()";
    const { __use_capture_exception, ...displayProps } = qe.props;
    void __use_capture_exception;
    return `Event: ${qe.event}\n${JSON.stringify(displayProps, null, 2)}`;
  };

  const handleQuickEvent = (qe: QuickEvent) => {
    if (qe.event === "__capture_pageview") {
      capturePageview();
      showToast("Pageview captured");
    } else if (qe.event === "__start_recording") {
      startSessionRecording();
      showToast("Session recording started");
    } else if (qe.event === "__stop_recording") {
      stopSessionRecording();
      showToast("Session recording stopped", "info");
    } else if ("__use_capture_exception" in qe.props) {
      captureException({ message: qe.props.message as string, type: qe.props.type as string, source: "Quick Events" });
      showToast(`"${qe.name}" sent`);
    } else if (qe.event === "pasture_purchase") {
      // Regenerate a fresh randomized payload on every click.
      const purchase = randomPurchaseProps();
      captureEvent(qe.event, purchase);
      showToast(`Purchased "${purchase.item}" for $${purchase.price_display}`);
    } else {
      captureEvent(qe.event, qe.props);
      showToast(`"${qe.name}" sent`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted text-sm">Welcome, {user?.name || "Guest"}! Fire some PostHog events.</p>
          </div>
          <HedgehogGif index={0} size="sm" />
        </div>

        {!isInitialized && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 text-warning text-sm">
            PostHog is not connected. Events will not be sent.{" "}
            <button onClick={() => router.push("/")} className="underline font-medium">
              Set up your API key
            </button>
          </div>
        )}

        {/* Quick Events */}
        <section className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Quick Events</h2>
          <p className="text-muted text-sm mb-4">
            Click any button to fire that event to PostHog immediately. Hover for payload details.
          </p>
          <div className="space-y-4">
            {quickEventGroups.map((group, gi) => (
              <div key={group.label}>
                {gi > 0 && <hr className="border-border mb-4" />}
                <p className="text-xs font-semibold text-muted mb-2">{group.label}</p>
                <div className="flex flex-wrap gap-3">
                  {group.events.map((qe) => (
                    <button
                      key={qe.event + qe.name}
                      onClick={() => handleQuickEvent(qe)}
                      title={getQuickEventTooltip(qe)}
                      className={`${qe.color} text-white text-sm font-medium py-3 px-4 rounded-lg transition-colors`}
                    >
                      {qe.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── People & Groups ── */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 bg-accent rounded-full" />
            <h2 className="text-lg font-semibold text-foreground">People & Groups</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Identify User */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="text-base font-semibold text-foreground mb-3">Identify User</h3>
              <p className="text-muted text-xs mb-3">
                Link the current anonymous user to a distinct ID with properties.
              </p>
              <div className="space-y-3">
                <input
                  type="text"
                  value={identifyId}
                  onChange={(e) => setIdentifyId(e.target.value)}
                  placeholder="user_distinct_id"
                  className="w-full px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm font-mono"
                />
                <textarea
                  value={identifyProps}
                  onChange={(e) => setIdentifyProps(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm font-mono"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleIdentify}
                    className="flex-1 py-2.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors text-sm"
                  >
                    Identify
                  </button>
                  <button
                    onClick={() => {
                      resetPerson();
                      showToast("Person reset", "info");
                    }}
                    className="py-2.5 px-4 bg-error/20 hover:bg-error/30 text-error font-medium rounded-lg transition-colors text-sm"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>

            {/* Group Identify */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="text-base font-semibold text-foreground mb-3">Group Identify</h3>
              <p className="text-muted text-xs mb-3">
                Associate the current user with a group (company, project, etc).
              </p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={groupType}
                    onChange={(e) => setGroupType(e.target.value)}
                    placeholder="Group type"
                    className="px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-warning text-sm font-mono"
                  />
                  <input
                    type="text"
                    value={groupKey}
                    onChange={(e) => setGroupKey(e.target.value)}
                    placeholder="Group key"
                    className="px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-warning text-sm font-mono"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleGroupIdentify}
                    className="flex-1 py-2.5 bg-warning/80 hover:bg-warning text-black font-medium rounded-lg transition-colors text-sm"
                  >
                    Group Identify
                  </button>
                  <button
                    onClick={async () => {
                      const ph = (await import("posthog-js")).default;
                      const groups = ph.getGroups();
                      setActiveGroups(groups as Record<string, unknown>);
                      addLog({
                        type: "group",
                        name: "Current Groups Viewed",
                        properties: groups as Record<string, unknown>,
                      });
                      showToast(
                        Object.keys(groups).length > 0
                          ? `${Object.keys(groups).length} group(s) found`
                          : "No groups set"
                      );
                    }}
                    className="py-2.5 px-4 bg-warning/20 hover:bg-warning/30 text-warning font-medium rounded-lg transition-colors text-sm"
                    title="Show current group associations"
                  >
                    Check
                  </button>
                </div>
                {activeGroups && (
                  <div className="bg-input-bg border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-muted">Current Groups</p>
                      <button
                        onClick={() => setActiveGroups(null)}
                        className="text-xs text-muted hover:text-foreground transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                    {Object.keys(activeGroups).length > 0 ? (
                      <pre className="text-xs font-mono text-foreground/80 overflow-x-auto">
                        {JSON.stringify(activeGroups, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-xs text-muted">No groups currently set.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Person Properties */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="text-base font-semibold text-foreground mb-3">Person Properties</h3>
              <p className="text-muted text-xs mb-3">
                Set properties on the current person without needing to re-identify.
              </p>
              <div className="space-y-3">
                <textarea
                  value={personProps}
                  onChange={(e) => setPersonProps(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm font-mono"
                />
                <button
                  onClick={handlePersonProps}
                  className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors text-sm"
                >
                  Set Person Properties
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Sandboxes ── */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 bg-blue-500 rounded-full" />
            <h2 className="text-lg font-semibold text-foreground">Sandboxes</h2>
          </div>

          {/* JS Sandbox */}
          <div className="bg-card border border-accent/30 rounded-xl p-6 mb-6">
            <h3 className="text-base font-semibold text-foreground mb-3">JavaScript Sandbox</h3>
            <p className="text-muted text-xs mb-3">
              Run JavaScript expressions. Results are captured as events. Errors are captured as exceptions.
            </p>
            <div className="space-y-3">
              <textarea
                value={jsCode}
                onChange={(e) => setJsCode(e.target.value)}
                rows={3}
                placeholder="document.title"
                className="w-full px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm font-mono"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleRunJs}
                  className="flex-1 py-2.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors text-sm"
                >
                  Run & Capture
                </button>
                <button
                  onClick={() => {
                    setJsCode("navigator.userAgent");
                    setJsResult("");
                    showToast("Snippet loaded", "info");
                  }}
                  className="py-2.5 px-3 bg-muted/20 hover:bg-muted/30 text-muted font-medium rounded-lg transition-colors text-xs"
                  title="navigator.userAgent"
                >
                  UA
                </button>
                <button
                  onClick={() => {
                    setJsCode('window.screen.width + "x" + window.screen.height');
                    setJsResult("");
                    showToast("Snippet loaded", "info");
                  }}
                  className="py-2.5 px-3 bg-muted/20 hover:bg-muted/30 text-muted font-medium rounded-lg transition-colors text-xs"
                  title="Screen size"
                >
                  Screen
                </button>
                <button
                  onClick={() => {
                    setJsCode('performance.now().toFixed(2) + "ms"');
                    setJsResult("");
                    showToast("Snippet loaded", "info");
                  }}
                  className="py-2.5 px-3 bg-muted/20 hover:bg-muted/30 text-muted font-medium rounded-lg transition-colors text-xs"
                  title="Performance timing"
                >
                  Perf
                </button>
                <button
                  onClick={() => {
                    setJsCode('document.cookie || "(no cookies)"');
                    setJsResult("");
                    showToast("Snippet loaded", "info");
                  }}
                  className="py-2.5 px-3 bg-muted/20 hover:bg-muted/30 text-muted font-medium rounded-lg transition-colors text-xs"
                  title="Cookies"
                >
                  Cookies
                </button>
              </div>
              {jsResult && (
                <pre className="px-4 py-3 bg-input-bg border border-border rounded-lg text-xs font-mono text-foreground/80 overflow-x-auto max-h-40 overflow-y-auto">
                  {jsResult}
                </pre>
              )}
              <div className="space-y-1">
                <p className="text-xs text-muted font-semibold">Quick snippets:</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    {
                      label: "Location",
                      code: "JSON.stringify({href: location.href, host: location.host, path: location.pathname})",
                    },
                    { label: "localStorage keys", code: "Object.keys(localStorage)" },
                    { label: "Online?", code: "navigator.onLine" },
                    { label: "Language", code: "navigator.language" },
                    { label: "Memory", code: "navigator.deviceMemory ? navigator.deviceMemory + 'GB' : 'N/A'" },
                    { label: "Timezone", code: "Intl.DateTimeFormat().resolvedOptions().timeZone" },
                    { label: "Color depth", code: "screen.colorDepth + '-bit'" },
                    { label: "Touch?", code: "'ontouchstart' in window" },
                  ].map((s) => (
                    <button
                      key={s.label}
                      onClick={() => {
                        setJsCode(s.code);
                        setJsResult("");
                        showToast(`"${s.label}" loaded`, "info");
                      }}
                      className="px-2 py-1 bg-accent/10 hover:bg-accent/20 text-accent text-xs rounded transition-colors"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* PostHog Console */}
          <div className="bg-card border border-primary/30 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">PostHog Console</h3>
                <p className="text-muted text-xs mt-1">
                  Run posthog-js commands directly, just like in the browser console. Use{" "}
                  <code className="bg-input-bg px-1.5 py-0.5 rounded text-primary font-mono text-xs">posthog</code> as
                  the reference.
                </p>
              </div>
              <a
                href="https://posthog.com/docs/libraries/js"
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 py-1.5 px-4 bg-primary/20 hover:bg-primary/30 text-primary font-medium rounded-lg transition-colors text-xs"
              >
                JS Docs &rarr;
              </a>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <textarea
                  value={phCommand}
                  onChange={(e) => setPhCommand(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handlePhCommand();
                    }
                  }}
                  rows={3}
                  placeholder="posthog.capture('my_event', { key: 'value' })"
                  className="w-full px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary text-sm font-mono pr-28"
                />
                <kbd className="absolute bottom-2.5 right-2.5 pointer-events-none inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-background border border-border rounded text-xs text-muted font-sans select-none">
                  <span>⌘</span>
                  <span>↵</span>
                </kbd>
              </div>
              <div className="flex gap-2 items-center">
                <button
                  onClick={handlePhCommand}
                  className="py-2.5 px-6 bg-primary hover:bg-primary-hover text-white font-medium rounded-lg transition-colors text-sm"
                >
                  Execute
                </button>
                <button
                  onClick={() => {
                    setPhHistory([]);
                    showToast("History cleared", "info");
                  }}
                  className="ml-auto py-2 px-3 bg-muted/20 hover:bg-muted/30 text-muted font-medium rounded-lg transition-colors text-xs"
                >
                  Clear History
                </button>
              </div>
            </div>

            {/* Quick Commands */}
            <div className="space-y-2">
              <p className="text-xs text-muted font-semibold">Quick Commands:</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "capture", code: "posthog.capture('test_event', { source: 'console' })" },
                  { label: "identify", code: "posthog.identify('user_123', { email: 'user@example.com' })" },
                  { label: "reset", code: "posthog.reset()" },
                  { label: "getDistinctId", code: "posthog.get_distinct_id()" },
                  { label: "getFeatureFlag", code: "posthog.getFeatureFlag('my-flag')" },
                  { label: "isFeatureEnabled", code: "posthog.isFeatureEnabled('my-flag')" },
                  { label: "reloadFlags", code: "posthog.reloadFeatureFlags()" },
                  { label: "setPersonProps", code: "posthog.setPersonProperties({ plan: 'premium' })" },
                  { label: "group", code: "posthog.group('company', 'company_id', { name: 'Acme' })" },
                  { label: "register", code: "posthog.register({ app_version: '2.0' })" },
                  { label: "unregister", code: "posthog.unregister('app_version')" },
                  { label: "opt_out", code: "posthog.opt_out_capturing()" },
                  { label: "opt_in", code: "posthog.opt_in_capturing()" },
                  { label: "startRecording", code: "posthog.startSessionRecording()" },
                  { label: "stopRecording", code: "posthog.stopSessionRecording()" },
                  { label: "$pageview", code: "posthog.capture('$pageview')" },
                  { label: "alias", code: "posthog.alias('new_id')" },
                  { label: "getSessionId", code: "posthog.get_session_id()" },
                ].map((cmd) => (
                  <button
                    key={cmd.label}
                    onClick={() => {
                      setPhCommand(cmd.code);
                      showToast(`"${cmd.label}" loaded`, "info");
                    }}
                    className="px-2 py-1 bg-primary/10 hover:bg-primary/20 text-primary text-xs rounded transition-colors font-mono"
                  >
                    {cmd.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Command Reference */}
            <details className="group">
              <summary className="cursor-pointer text-xs font-semibold text-muted hover:text-foreground transition-colors">
                Command Reference &amp; Documentation
              </summary>
              <div className="mt-3 space-y-3 text-xs text-muted">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-input-bg rounded-lg p-3 space-y-1.5">
                    <p className="font-semibold text-foreground">Event Capture</p>
                    <code className="block text-primary/80">posthog.capture(event, properties?)</code>
                    <code className="block text-primary/80">posthog.capture(&apos;$pageview&apos;)</code>
                    <code className="block text-primary/80">posthog.capture(&apos;$pageleave&apos;)</code>
                    <code className="block text-primary/80">
                      posthog.capture(&apos;$screen&apos;, &#123; $screen_name &#125;)
                    </code>
                  </div>
                  <div className="bg-input-bg rounded-lg p-3 space-y-1.5">
                    <p className="font-semibold text-foreground">Identity</p>
                    <code className="block text-primary/80">posthog.identify(distinctId, props?)</code>
                    <code className="block text-primary/80">posthog.alias(alias, distinctId?)</code>
                    <code className="block text-primary/80">posthog.reset()</code>
                    <code className="block text-primary/80">posthog.get_distinct_id()</code>
                  </div>
                  <div className="bg-input-bg rounded-lg p-3 space-y-1.5">
                    <p className="font-semibold text-foreground">Person &amp; Group</p>
                    <code className="block text-primary/80">posthog.setPersonProperties(props)</code>
                    <code className="block text-primary/80">posthog.setPersonPropertiesForFlags(props)</code>
                    <code className="block text-primary/80">posthog.group(type, key, props?)</code>
                  </div>
                  <div className="bg-input-bg rounded-lg p-3 space-y-1.5">
                    <p className="font-semibold text-foreground">Feature Flags</p>
                    <code className="block text-primary/80">posthog.isFeatureEnabled(key)</code>
                    <code className="block text-primary/80">posthog.getFeatureFlag(key)</code>
                    <code className="block text-primary/80">posthog.reloadFeatureFlags()</code>
                  </div>
                  <div className="bg-input-bg rounded-lg p-3 space-y-1.5">
                    <p className="font-semibold text-foreground">Super Properties</p>
                    <code className="block text-primary/80">posthog.register(props)</code>
                    <code className="block text-primary/80">posthog.register_once(props)</code>
                    <code className="block text-primary/80">posthog.unregister(key)</code>
                  </div>
                  <div className="bg-input-bg rounded-lg p-3 space-y-1.5">
                    <p className="font-semibold text-foreground">Privacy &amp; Recording</p>
                    <code className="block text-primary/80">posthog.opt_in_capturing()</code>
                    <code className="block text-primary/80">posthog.opt_out_capturing()</code>
                    <code className="block text-primary/80">posthog.has_opted_out_capturing()</code>
                    <code className="block text-primary/80">posthog.startSessionRecording()</code>
                    <code className="block text-primary/80">posthog.stopSessionRecording()</code>
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <a
                    href="https://posthog.com/docs/libraries/js"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary-hover transition-colors underline"
                  >
                    posthog-js Documentation
                  </a>
                  <a
                    href="https://posthog.com/docs/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary-hover transition-colors underline"
                  >
                    PostHog API Reference
                  </a>
                  <a
                    href="https://posthog.com/docs/data/events"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary-hover transition-colors underline"
                  >
                    Event Types Guide
                  </a>
                </div>
              </div>
            </details>

            {/* History */}
            {phHistory.length > 0 && (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                <p className="text-xs text-muted font-semibold">History:</p>
                {phHistory.map((entry, i) => (
                  <div
                    key={i}
                    className={`bg-input-bg rounded-lg p-3 border ${entry.isError ? "border-error/30" : "border-border/50"}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <code className="text-xs text-muted font-mono truncate flex-1">{entry.command}</code>
                      <button
                        onClick={() => {
                          setPhCommand(entry.command);
                          showToast("Command loaded", "info");
                        }}
                        className="ml-2 text-xs text-primary hover:text-primary-hover transition-colors shrink-0"
                      >
                        Reuse
                      </button>
                    </div>
                    <pre
                      className={`text-xs font-mono overflow-x-auto ${entry.isError ? "text-error" : "text-foreground/80"}`}
                    >
                      {entry.result}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <ToastStack toasts={toasts} />
    </div>
  );
}
