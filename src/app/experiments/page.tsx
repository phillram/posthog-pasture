"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { usePosthog } from "@/contexts/PosthogContext";
import Navbar from "@/components/Navbar";
import HedgehogGif from "@/components/HedgehogGif";
import ToastStack from "@/components/ToastStack";
import { useToast } from "@/hooks/useToast";
import { randomPurchaseProps } from "@/lib/purchase";
import {
  generateUsername,
  buildPersonProps,
  buildProtocolMarkerEvent,
  randomProfilePreset,
} from "@/lib/simulatedUsers";

// ── Conversion actions ────────────────────────────────────────────────────────

const CONVERSION_ACTIONS = [
  // Purchase props are regenerated per simulated user at batch-build time
  // (see `runExperiment`) via `randomPurchaseProps()`. The value here is just a
  // preview for the wizard card.
  {
    label: "Purchase",
    event: "pasture_purchase",
    props: { item: "hedgehog_<random>", price: "<random $0.01–$1000.00>" },
  },
  { label: "Sign Up", event: "pasture_signup", props: { source: "experiment" } },
  { label: "Checkout", event: "pasture_checkout_started", props: { cart_value: 49.99 } },
  { label: "Feature Used", event: "pasture_feature_used", props: { feature: "experiment_feature" } },
  { label: "Form Submit", event: "pasture_form_submitted", props: { form_name: "experiment_form" } },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExperimentUser {
  username: string;
  /** Variant returned by PostHog's /decide endpoint for this user */
  variant: string;
  actionCompleted: boolean;
}

type WizardStep = "configure" | "running" | "results";

// How many /decide calls to fire in parallel (browser allows ~6 per domain)
const DECIDE_CONCURRENCY = 6;

export default function ExperimentsPage() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { featureFlags, flagsReady, isInitialized, captureEvent, config } = usePosthog();
  const router = useRouter();

  // ── Wizard state ──
  const [step, setStep] = useState<WizardStep>("configure");

  // Step 1: flag selection
  const [selectedFlag, setSelectedFlag] = useState("");
  const [showAllFlags, setShowAllFlags] = useState(false);

  // Step 2: user count
  const [userCount, setUserCount] = useState(50);

  // Step 3: conversion action
  const [selectedAction, setSelectedAction] = useState(CONVERSION_ACTIONS[0].event);

  // Step 4: conversion % — randomised on mount
  const [conversionPct, setConversionPct] = useState(() => Math.floor(Math.random() * 100) + 1);

  // Running state
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [results, setResults] = useState<ExperimentUser[]>([]);
  const [runError, setRunError] = useState("");

  // Toast
  const { toasts, showToast } = useToast();

  if (isLoading) return null;
  if (!isAuthenticated) {
    router.push("/login");
    return null;
  }
  if (!config.apiKey) {
    router.push("/");
    return null;
  }

  // ── Flag classification ──
  const flagNames = Object.keys(featureFlags).sort();
  // Heuristic: string-valued flags are multivariate → likely linked to experiments
  const experimentFlagNames = flagNames.filter((k) => typeof featureFlags[k] === "string");
  const boolFlagNames = flagNames.filter((k) => typeof featureFlags[k] === "boolean");
  // Fall back to showing all if no multivariate flags are present
  const visibleFlags = showAllFlags || experimentFlagNames.length === 0 ? flagNames : experimentFlagNames;

  const actionInfo = CONVERSION_ACTIONS.find((a) => a.event === selectedAction) || CONVERSION_ACTIONS[0];

  // ── Experiment runner ──

  const runExperiment = async () => {
    if (!selectedFlag) return;

    setRunError("");
    setProgressLabel("Evaluating flags…");
    setStep("running");
    setProgress(0);

    captureEvent("pasture_experiment_started", {
      flag: selectedFlag,
      user_count: userCount,
      conversion_action: selectedAction,
      conversion_pct: conversionPct,
      triggered_by: user?.id,
    });

    // Pre-generate all usernames and conversion outcomes up front so we can
    // reference them stably across the async decide calls.
    const now = new Date();
    const plan: Array<{ username: string; actionCompleted: boolean; ts: string }> = Array.from(
      { length: userCount },
      (_, i) => ({
        username: generateUsername(i),
        // Determine NOW whether this user will convert — independent of variant
        actionCompleted: Math.random() * 100 < conversionPct,
        // Stagger timestamps so PostHog preserves event order
        ts: new Date(now.getTime() + i * 100).toISOString(),
      })
    );

    // ── Phase 1: Call /decide for each user to get their actual flag variant ──
    // PostHog evaluates the rollout rules against the distinct_id — this is the
    // real assignment, not something we pick ourselves.
    const variants: (string | boolean)[] = new Array(userCount).fill(false);
    const decideUrl = `${config.apiHost}/decide?v=3`;

    let evaluated = 0;
    for (let i = 0; i < userCount; i += DECIDE_CONCURRENCY) {
      const chunk = plan.slice(i, i + DECIDE_CONCURRENCY);
      await Promise.all(
        chunk.map(async ({ username }, j) => {
          try {
            const res = await fetch(decideUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                token: config.apiKey,
                distinct_id: username,
                groups: {},
              }),
            });
            if (res.ok) {
              const data = await res.json();
              variants[i + j] = data.featureFlags?.[selectedFlag] ?? false;
            }
          } catch {
            // If decide fails for a user, keep false (flag off)
          }
        })
      );
      evaluated = Math.min(i + DECIDE_CONCURRENCY, userCount);
      setProgress(Math.round((evaluated / userCount) * 70)); // 0–70% = decide phase
      setProgressLabel(`Evaluating flags… (${evaluated}/${userCount})`);
      await new Promise((r) => setTimeout(r, 0)); // yield to React
    }

    // ── Phase 2: Build the batch payload ──
    setProgressLabel("Building event batch…");
    const generated: ExperimentUser[] = [];
    const batchEvents: Record<string, unknown>[] = [];

    for (let i = 0; i < userCount; i++) {
      const { username, actionCompleted, ts } = plan[i];
      const variant = String(variants[i]);

      // Step 2: Identify the user in PostHog with a full profile (plan,
      // monthly_sessions, …) — the preset is randomised per user so an
      // experiment run produces a realistic mix of personas.
      batchEvents.push({
        event: "$identify",
        distinct_id: username,
        timestamp: ts,
        properties: {
          $set: buildPersonProps(randomProfilePreset(), username),
        },
      });

      // Append the protocol marker as its own `$set` event so the
      // "this user came from the Experiments page" tag stays decoupled from
      // the shared person-profile shape.
      batchEvents.push(buildProtocolMarkerEvent(username, "pasture_experiment", ts));

      // Step 3: Record flag exposure with the variant PostHog assigned
      batchEvents.push({
        event: "$feature_flag_called",
        distinct_id: username,
        timestamp: ts,
        properties: {
          $feature_flag: selectedFlag,
          $feature_flag_response: variants[i],
        },
      });

      // Step 4: Fire the conversion event for users who convert
      if (actionCompleted) {
        // For pasture_purchase, regenerate randomized item + price per user so
        // each converted simulated user shows up with their own merchandise
        // and dollar amount in PostHog.
        const conversionProps =
          actionInfo.event === "pasture_purchase" ? randomPurchaseProps() : actionInfo.props;
        batchEvents.push({
          event: actionInfo.event,
          distinct_id: username,
          timestamp: ts,
          properties: {
            ...conversionProps,
            experiment_flag: selectedFlag,
            $feature_flag: selectedFlag,
            $feature_flag_response: variants[i],
          },
        });
      }

      generated.push({ username, variant, actionCompleted });
    }

    setProgress(80);
    setProgressLabel("Sending batch to PostHog…");
    await new Promise((r) => setTimeout(r, 0));

    // ── Phase 3: Send all events in a single batch request ──
    // Each event has its own distinct_id — the real logged-in session is never touched.
    try {
      const res = await fetch(`${config.apiHost}/batch/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: config.apiKey,
          batch: batchEvents,
          sent_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        setRunError(`PostHog returned HTTP ${res.status}. Check your API key and host.`);
      }
    } catch (err) {
      setRunError(`Network error sending batch: ${(err as Error).message}`);
    }

    setProgress(100);
    setResults(generated);

    captureEvent("pasture_experiment_completed", {
      flag: selectedFlag,
      user_count: userCount,
      conversion_action: selectedAction,
      conversion_pct: conversionPct,
      converted_count: generated.filter((u) => u.actionCompleted).length,
    });

    setStep("results");
    showToast(`Done — ${generated.filter((u) => u.actionCompleted).length}/${userCount} users converted`);
  };

  // ── PostHog experiment URL ──
  const posthogHost = config.apiHost.includes("eu.") ? "https://eu.posthog.com" : "https://us.posthog.com";
  const experimentUrl = `${posthogHost}/experiments`;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Experiments</h1>
            <p className="text-muted text-sm">
              Generate realistic experiment data. PostHog assigns each simulated user their variant via the decide API —
              no manual assignment.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {step !== "configure" && (
              <button
                onClick={() => {
                  setStep("configure");
                  setResults([]);
                  setProgress(0);
                  setRunError("");
                  setProgressLabel("");
                }}
                className="py-2.5 px-4 bg-warning/20 hover:bg-warning/30 text-warning font-medium rounded-lg transition-colors text-sm"
              >
                ← New Experiment
              </button>
            )}
            <HedgehogGif index={0} size="sm" />
          </div>
        </div>

        {!isInitialized && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 text-warning text-sm">
            PostHog is not connected.{" "}
            <button onClick={() => router.push("/")} className="underline font-medium">
              Set up your API key
            </button>
          </div>
        )}

        {/* ── Configure step ── */}
        {step === "configure" && (
          <div className="space-y-6">
            {/* Step 1: Flag selection */}
            <section className="bg-card border border-warning/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-6 h-6 rounded-full bg-warning text-black text-xs font-bold flex items-center justify-center shrink-0">
                  1
                </span>
                <h2 className="text-base font-semibold text-foreground">Select a feature flag</h2>
                {flagsReady && experimentFlagNames.length > 0 && boolFlagNames.length > 0 && (
                  <button
                    onClick={() => setShowAllFlags((v) => !v)}
                    className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
                      showAllFlags
                        ? "bg-warning border-warning text-black hover:bg-warning-hover"
                        : "bg-warning/10 border-warning/30 text-warning hover:bg-warning/20"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${showAllFlags ? "bg-black" : "bg-warning"}`} />
                    {showAllFlags
                      ? `All flags (${flagNames.length})`
                      : `Experiment flags only (${experimentFlagNames.length})`}
                  </button>
                )}
              </div>
              <p className="text-muted text-xs mb-3 ml-9">
                Multivariate flags are shown by default — these are typically linked to experiments. PostHog evaluates
                each flag per user using its own rollout rules.
              </p>

              {!flagsReady ? (
                <p className="text-muted text-sm ml-9">Loading flags… make sure PostHog is connected.</p>
              ) : flagNames.length === 0 ? (
                <p className="text-muted text-sm ml-9">No feature flags found in your project.</p>
              ) : (
                <>
                  {experimentFlagNames.length === 0 && (
                    <div className="ml-9 mb-3 p-3 bg-warning/10 border border-warning/20 rounded-lg text-xs text-warning">
                      No multivariate flags found — showing all flags. Multivariate flags (string variants like
                      &ldquo;control&rdquo;, &ldquo;test&rdquo;) are typically linked to experiments.
                    </div>
                  )}
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 ml-9">
                    {visibleFlags.map((key) => {
                      const val = featureFlags[key];
                      const isExperiment = typeof val === "string";
                      return (
                        <button
                          key={key}
                          onClick={() => setSelectedFlag(key)}
                          className={`px-2 py-1.5 rounded-lg border text-xs font-mono text-left transition-colors ${
                            selectedFlag === key
                              ? "bg-warning border-warning text-black"
                              : "bg-warning/10 border-warning/30 text-warning hover:bg-warning/20"
                          }`}
                        >
                          <span className="flex items-start gap-1.5 leading-tight">
                            <span className="shrink-0 font-sans">{isExperiment ? "🧪" : "🚩"}</span>
                            <span className="break-all">{key}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </section>

            {/* Step 2: User count */}
            <section className="bg-card border border-warning/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-6 h-6 rounded-full bg-warning text-black text-xs font-bold flex items-center justify-center shrink-0">
                  2
                </span>
                <h2 className="text-base font-semibold text-foreground">Number of simulated users</h2>
              </div>
              <div className="flex items-center gap-4 ml-9">
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={userCount}
                  onChange={(e) => setUserCount(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
                  className="w-24 px-4 py-2.5 bg-input-bg border border-warning/30 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-warning text-sm font-mono"
                />
                <div className="flex gap-2 flex-wrap">
                  {[10, 25, 50, 100, 200].map((n) => (
                    <button
                      key={n}
                      onClick={() => setUserCount(n)}
                      className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                        userCount === n
                          ? "bg-warning border-warning text-black"
                          : "bg-warning/10 hover:bg-warning/20 text-warning border-warning/30"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted mt-2 ml-9">
                Max 500 users. Variants are assigned by PostHog based on each user&apos;s distinct ID.
              </p>
            </section>

            {/* Step 3: Conversion rate */}
            <section className="bg-card border border-warning/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-6 h-6 rounded-full bg-warning text-black text-xs font-bold flex items-center justify-center shrink-0">
                  3
                </span>
                <h2 className="text-base font-semibold text-foreground">Conversion rate</h2>
              </div>
              <p className="text-muted text-xs mb-3 ml-9">
                Percentage of simulated users who complete the conversion action. Defaults to a random value — override
                if needed.
              </p>
              <div className="flex items-center gap-4 ml-9">
                <div className="flex items-center">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={conversionPct}
                    onChange={(e) => setConversionPct(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                    className="w-24 px-4 py-2.5 bg-input-bg border border-warning/30 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-warning text-sm font-mono"
                  />
                  <span className="ml-2 text-muted text-sm">%</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[5, 10, 25, 50, 75].map((n) => (
                    <button
                      key={n}
                      onClick={() => setConversionPct(n)}
                      className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                        conversionPct === n
                          ? "bg-warning border-warning text-black"
                          : "bg-warning/10 hover:bg-warning/20 text-warning border-warning/30"
                      }`}
                    >
                      {n}%
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Step 4: Conversion action */}
            <section className="bg-card border border-warning/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-6 h-6 rounded-full bg-warning text-black text-xs font-bold flex items-center justify-center shrink-0">
                  4
                </span>
                <h2 className="text-base font-semibold text-foreground">Conversion action</h2>
              </div>
              <p className="text-muted text-xs mb-3 ml-9">The event fired for users who convert.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 ml-9">
                {CONVERSION_ACTIONS.map((action) => (
                  <button
                    key={action.event}
                    onClick={() => setSelectedAction(action.event)}
                    className={`min-w-0 overflow-hidden px-3 py-2.5 rounded-lg border text-left transition-colors ${
                      selectedAction === action.event
                        ? "bg-warning border-warning text-black"
                        : "bg-warning/10 border-warning/30 text-warning hover:bg-warning/20"
                    }`}
                  >
                    <span className="block text-sm font-semibold truncate">{action.label}</span>
                    <span
                      className={`block text-xs font-mono mt-0.5 truncate ${selectedAction === action.event ? "text-black/80" : "text-warning/80"}`}
                    >
                      {action.event}
                    </span>
                    <span
                      className={`block text-xs mt-0.5 break-all ${selectedAction === action.event ? "text-black/70" : "text-warning/70"}`}
                    >
                      {JSON.stringify(action.props)}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {/* Summary + Start */}
            <div className="bg-card border border-warning/30 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-foreground mb-3">Summary</h3>
              <div className="grid grid-cols-2 gap-3 text-sm mb-5">
                <div>
                  <p className="text-muted text-xs">Flag</p>
                  <p className="font-mono text-foreground mt-0.5">
                    {selectedFlag || <span className="text-error text-xs">Not selected</span>}
                  </p>
                </div>
                <div>
                  <p className="text-muted text-xs">Simulated users</p>
                  <p className="font-mono text-foreground mt-0.5">{userCount}</p>
                </div>
                <div>
                  <p className="text-muted text-xs">Conversion rate</p>
                  <p className="font-mono text-foreground mt-0.5">{conversionPct}%</p>
                </div>
                <div>
                  <p className="text-muted text-xs">Action</p>
                  <p className="font-mono text-foreground mt-0.5">{actionInfo.event}</p>
                </div>
              </div>
              <button
                onClick={runExperiment}
                disabled={!selectedFlag || !isInitialized}
                className="w-full py-3 bg-warning hover:bg-warning-hover text-black font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🚀 Start Experiment
              </button>
              {!selectedFlag && (
                <p className="text-error text-xs mt-2 text-center">Select a feature flag to continue</p>
              )}
            </div>
          </div>
        )}

        {/* ── Running step ── */}
        {step === "running" && (
          <div className="bg-card border border-warning/30 rounded-xl p-10 flex flex-col items-center text-center space-y-6">
            <div className="text-5xl animate-pulse">🧪</div>
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-1">Running experiment…</h2>
              <p className="text-muted text-sm">
                {progressLabel || `Processing flag `}
                <code className="font-mono text-warning">{selectedFlag}</code>
              </p>
            </div>
            <div className="w-full max-w-sm">
              <div className="flex justify-between text-xs text-muted mb-1">
                <span>{progressLabel || "Working…"}</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-3 bg-input-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-warning rounded-full transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <div className="text-muted text-xs space-y-1">
              <p>
                Phase 1 (0–70%): PostHog evaluates each user&apos;s flag variant via{" "}
                <code className="font-mono">/decide</code>
              </p>
              <p>Phase 2 (70–80%): Building event batch</p>
              <p>
                Phase 3 (80–100%): Sending to PostHog via <code className="font-mono">/batch/</code>
              </p>
            </div>
          </div>
        )}

        {/* ── Results step ── */}
        {step === "results" && (
          <div className="space-y-4">
            {/* Error banner */}
            {runError && (
              <div className="bg-error/10 border border-error/30 rounded-lg p-4 text-error text-sm">
                <strong>Batch send error:</strong> {runError}
              </div>
            )}

            {/* Flag used */}
            <div className="flex items-center gap-3 px-4 py-3 bg-card border border-warning/20 rounded-xl flex-wrap">
              <span className="text-muted text-sm">Experiment flag:</span>
              <code className="font-mono text-warning font-semibold">{selectedFlag}</code>
              <span className="text-muted text-xs">
                · {userCount} users · {conversionPct}% target conversion · variants assigned by PostHog
              </span>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-card border border-warning/30 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{results.length}</p>
                <p className="text-xs text-muted mt-1">Total users</p>
              </div>
              <div className="bg-card border border-success/30 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-success">{results.filter((u) => u.actionCompleted).length}</p>
                <p className="text-xs text-muted mt-1">Converted</p>
              </div>
              <div className="bg-card border border-warning/30 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-warning">
                  {results.length > 0
                    ? `${Math.round((results.filter((u) => u.actionCompleted).length / results.length) * 100)}%`
                    : "—"}
                </p>
                <p className="text-xs text-muted mt-1">Actual conversion rate</p>
              </div>
            </div>

            {/* Per-variant breakdown — dynamic, based on whatever PostHog returned */}
            {(() => {
              const uniqueVariants = [...new Set(results.map((u) => u.variant))].sort();
              return (
                <div className="bg-card border border-warning/30 rounded-xl p-6">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Variant breakdown</h3>
                  <div className={`grid gap-3 ${uniqueVariants.length <= 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                    {uniqueVariants.map((v) => {
                      const group = results.filter((u) => u.variant === v);
                      const converted = group.filter((u) => u.actionCompleted).length;
                      return (
                        <div key={v} className="bg-input-bg border border-warning/20 rounded-lg p-3">
                          <span className="inline-block font-mono text-sm font-medium px-2 py-0.5 rounded bg-warning/20 text-warning">
                            {v}
                          </span>
                          <p className="text-xs text-muted mt-2">
                            {group.length} users · {converted} converted
                          </p>
                          <p className="text-xs font-semibold text-warning mt-0.5">
                            {group.length > 0 ? `${Math.round((converted / group.length) * 100)}%` : "—"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Results table */}
            <div className="bg-card border border-warning/30 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">User results</h3>
                <a
                  href={experimentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2 px-4 bg-warning/20 hover:bg-warning/30 text-warning font-medium rounded-lg transition-colors text-xs"
                >
                  View in PostHog →
                </a>
              </div>
              <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border">
                      <th className="text-left text-xs text-muted font-semibold pb-2 pr-4">Username</th>
                      <th className="text-left text-xs text-muted font-semibold pb-2 pr-4">Variant (PostHog)</th>
                      <th className="text-left text-xs text-muted font-semibold pb-2">{actionInfo.label}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((u) => (
                      <tr key={u.username} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 pr-4 font-mono text-xs text-foreground">{u.username}</td>
                        <td className="py-1.5 pr-4">
                          <span
                            className={`px-2 py-0.5 text-xs rounded font-mono ${
                              u.variant === "false"
                                ? "bg-muted/20 text-muted/70"
                                : "bg-warning/20 text-warning"
                            }`}
                          >
                            {u.variant}
                          </span>
                        </td>
                        <td className="py-1.5">
                          {u.actionCompleted ? (
                            <span className="text-success font-semibold text-base" title="Completed">
                              ✓
                            </span>
                          ) : (
                            <span className="text-muted/40 text-base" title="Not completed">
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      <ToastStack toasts={toasts} />
    </div>
  );
}
