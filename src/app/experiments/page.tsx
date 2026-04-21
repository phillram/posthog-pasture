"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { usePosthog } from "@/contexts/PosthogContext";
import Navbar from "@/components/Navbar";

// ── Name generation ──────────────────────────────────────────────────────────

const ADJECTIVES = [
  "swift", "brave", "golden", "silver", "scarlet", "cosmic", "fuzzy", "blazing",
  "stormy", "crimson", "turbo", "vivid", "ancient", "electric", "silent", "bold",
  "jade", "rusty", "marble", "velvet", "neon", "amber", "cobalt", "mossy",
];
const NOUNS = [
  "hedgehog", "badger", "falcon", "rabbit", "otter", "porcupine", "marmot",
  "sparrow", "lynx", "wombat", "capybara", "penguin", "flamingo", "quokka",
  "axolotl", "narwhal", "platypus", "toucan", "gecko", "raccoon", "lemur",
];

function generateUsername(index: number): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}_${noun}_${String(index + 1).padStart(3, "0")}`;
}

// ── Conversion actions ────────────────────────────────────────────────────────

const CONVERSION_ACTIONS = [
  { label: "Purchase", event: "pasture_purchase", props: { item: "experiment_product", price: 29.99 } },
  { label: "Sign Up", event: "pasture_signup", props: { source: "experiment" } },
  { label: "Checkout", event: "pasture_checkout_started", props: { cart_value: 49.99 } },
  { label: "Feature Used", event: "pasture_feature_used", props: { feature: "experiment_feature" } },
  { label: "Form Submit", event: "pasture_form_submitted", props: { form_name: "experiment_form" } },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExperimentUser {
  username: string;
  variant: string;
  actionCompleted: boolean;
}

type WizardStep = "configure" | "running" | "results";

const VARIANTS = ["control", "test"] as const;

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

  // Step 4: conversion %  — randomised on mount
  const [conversionPct, setConversionPct] = useState(
    () => Math.floor(Math.random() * 100) + 1
  );

  // Running state
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ExperimentUser[]>([]);
  const [runError, setRunError] = useState("");

  // Toast
  const [toasts, setToasts] = useState<{ id: string; message: string; type: "success" | "error" | "info" }[]>([]);
  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "success") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2500);
  }, []);

  if (isLoading) return null;
  if (!isAuthenticated) { router.push("/login"); return null; }
  if (!config.apiKey) { router.push("/"); return null; }

  // ── Flag classification ──
  const flagNames = Object.keys(featureFlags).sort();
  // Heuristic: string-valued flags are multivariate → likely experiments
  const experimentFlagNames = flagNames.filter((k) => typeof featureFlags[k] === "string");
  const boolFlagNames = flagNames.filter((k) => typeof featureFlags[k] === "boolean");
  // If no string flags exist, fall back to showing everything
  const visibleFlags = (showAllFlags || experimentFlagNames.length === 0) ? flagNames : experimentFlagNames;

  const actionInfo = CONVERSION_ACTIONS.find((a) => a.event === selectedAction) || CONVERSION_ACTIONS[0];

  // ── Experiment runner ──

  const runExperiment = async () => {
    if (!selectedFlag) return;

    setRunError("");

    captureEvent("pasture_experiment_started", {
      flag: selectedFlag,
      user_count: userCount,
      conversion_action: selectedAction,
      conversion_pct: conversionPct,
      triggered_by: user?.id,
    });

    setStep("running");
    setProgress(0);

    const generated: ExperimentUser[] = [];
    const batchEvents: Record<string, unknown>[] = [];
    const now = new Date();

    for (let i = 0; i < userCount; i++) {
      const username = generateUsername(i);
      // Distribute evenly across control / test
      const variant = VARIANTS[i % VARIANTS.length];
      const actionCompleted = Math.random() * 100 < conversionPct;
      // Stagger timestamps so events appear in correct order in PostHog
      const ts = new Date(now.getTime() + i * 100).toISOString();

      // 1. $identify — creates the person in PostHog with distinct identity
      batchEvents.push({
        event: "$identify",
        distinct_id: username,
        timestamp: ts,
        properties: {
          $set: { name: username, experiment_user: true },
        },
      });

      // 2. $feature_flag_called — records experiment exposure
      batchEvents.push({
        event: "$feature_flag_called",
        distinct_id: username,
        timestamp: ts,
        properties: {
          $feature_flag: selectedFlag,
          $feature_flag_response: variant,
        },
      });

      // 3. Conversion event — only for users who convert at the target rate
      if (actionCompleted) {
        batchEvents.push({
          event: actionInfo.event,
          distinct_id: username,
          timestamp: ts,
          properties: {
            ...actionInfo.props,
            experiment_flag: selectedFlag,
            variant,
          },
        });
      }

      generated.push({ username, variant, actionCompleted });

      // Yield to React every 10 users to update the progress bar
      if (i % 10 === 9 || i === userCount - 1) {
        setProgress(Math.round(((i + 1) / userCount) * 100));
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    // Send all events in a single batch — each event has its own distinct_id
    // so the real logged-in user's session is never touched.
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
            <h1 className="text-2xl font-bold text-foreground">🧪 Experiments</h1>
            <p className="text-muted text-sm">
              Generate realistic experiment data — identify simulated users, assign variants, and fire conversion events directly via the PostHog batch API.
            </p>
          </div>
          {step !== "configure" && (
            <button
              onClick={() => { setStep("configure"); setResults([]); setProgress(0); setRunError(""); }}
              className="py-2 px-4 bg-muted/20 hover:bg-muted/30 text-muted font-medium rounded-lg transition-colors text-sm"
            >
              ← New Experiment
            </button>
          )}
        </div>

        {!isInitialized && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 text-warning text-sm">
            PostHog is not connected. <button onClick={() => router.push("/")} className="underline font-medium">Set up your API key</button>
          </div>
        )}

        {/* ── Configure step ── */}
        {step === "configure" && (
          <div className="space-y-6">

            {/* Step 1: Flag selection */}
            <section className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
                <h2 className="text-base font-semibold text-foreground">Select a feature flag</h2>
              </div>
              <p className="text-muted text-xs mb-3 ml-9">
                Multivariate flags (string values) are shown by default — these are associated with experiments.
              </p>

              {!flagsReady ? (
                <p className="text-muted text-sm ml-9">Loading flags… make sure PostHog is connected.</p>
              ) : flagNames.length === 0 ? (
                <p className="text-muted text-sm ml-9">No feature flags found in your project.</p>
              ) : (
                <>
                  {experimentFlagNames.length === 0 && (
                    <div className="ml-9 mb-3 p-3 bg-warning/10 border border-warning/20 rounded-lg text-xs text-warning">
                      No multivariate flags found — showing all flags. Multivariate flags (string variants) are typically linked to experiments.
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 ml-9">
                    {visibleFlags.map((key) => {
                      const val = featureFlags[key];
                      const isExperiment = typeof val === "string";
                      return (
                        <button
                          key={key}
                          onClick={() => setSelectedFlag(key)}
                          className={`px-3 py-2.5 rounded-lg border text-sm font-mono text-left transition-colors ${
                            selectedFlag === key
                              ? "bg-primary/20 border-primary text-primary"
                              : "bg-input-bg border-border text-foreground hover:border-primary/50"
                          }`}
                        >
                          <span className="flex items-center gap-1.5 flex-wrap">
                            {key}
                            <span className={`text-xs px-1.5 py-0.5 rounded font-sans ${
                              isExperiment
                                ? "bg-warning/20 text-warning"
                                : "bg-muted/20 text-muted"
                            }`}>
                              {isExperiment ? "🧪 Exp" : "🚩 Flag"}
                            </span>
                          </span>
                          <span className="block text-xs text-muted font-sans mt-0.5">
                            {typeof val === "boolean" ? (val ? "true" : "false") : String(val || "—")}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Toggle boolean flags */}
                  {experimentFlagNames.length > 0 && boolFlagNames.length > 0 && (
                    <button
                      onClick={() => setShowAllFlags((v) => !v)}
                      className="mt-3 ml-9 text-xs text-muted hover:text-foreground transition-colors underline"
                    >
                      {showAllFlags
                        ? "Show experiment flags only"
                        : `Also show ${boolFlagNames.length} boolean flag${boolFlagNames.length !== 1 ? "s" : ""}`}
                    </button>
                  )}
                </>
              )}
            </section>

            {/* Step 2: User count */}
            <section className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0">2</span>
                <h2 className="text-base font-semibold text-foreground">Number of simulated users</h2>
              </div>
              <div className="flex items-center gap-4 ml-9">
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={userCount}
                  onChange={(e) => setUserCount(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
                  className="w-24 px-3 py-2.5 bg-input-bg border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm font-mono"
                />
                <div className="flex gap-2 flex-wrap">
                  {[10, 25, 50, 100, 200].map((n) => (
                    <button
                      key={n}
                      onClick={() => setUserCount(n)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        userCount === n ? "bg-primary text-white" : "bg-input-bg hover:bg-primary/10 text-muted border border-border"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted mt-2 ml-9">Max 500 users. Users are distributed evenly as <code className="font-mono">control</code> / <code className="font-mono">test</code>.</p>
            </section>

            {/* Step 3: Conversion action */}
            <section className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0">3</span>
                <h2 className="text-base font-semibold text-foreground">Conversion action</h2>
              </div>
              <p className="text-muted text-xs mb-3 ml-9">The event fired for users who convert. Hover for the event name.</p>
              <div className="flex flex-wrap gap-1.5 ml-9">
                {CONVERSION_ACTIONS.map((action) => (
                  <button
                    key={action.event}
                    onClick={() => setSelectedAction(action.event)}
                    title={action.event}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      selectedAction === action.event
                        ? "bg-success/20 border-success text-success"
                        : "bg-input-bg border-border text-foreground hover:border-success/50"
                    }`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted mt-2 ml-9 font-mono">{actionInfo.event}</p>
            </section>

            {/* Step 4: Conversion rate */}
            <section className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0">4</span>
                <h2 className="text-base font-semibold text-foreground">Conversion rate</h2>
              </div>
              <p className="text-muted text-xs mb-3 ml-9">
                Percentage of simulated users who complete the conversion action. Defaults to a random value — override if needed.
              </p>
              <div className="flex items-center gap-4 ml-9">
                <div className="relative flex items-center">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={conversionPct}
                    onChange={(e) => setConversionPct(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                    className="w-24 px-3 py-2.5 bg-input-bg border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm font-mono"
                  />
                  <span className="ml-2 text-muted text-sm">%</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[5, 10, 25, 50, 75].map((n) => (
                    <button
                      key={n}
                      onClick={() => setConversionPct(n)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        conversionPct === n ? "bg-primary text-white" : "bg-input-bg hover:bg-primary/10 text-muted border border-border"
                      }`}
                    >
                      {n}%
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Summary + Start */}
            <div className="bg-card border border-primary/30 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-foreground mb-3">Summary</h3>
              <div className="grid grid-cols-2 gap-3 text-sm mb-5">
                <div>
                  <p className="text-muted text-xs">Flag</p>
                  <p className="font-mono text-foreground mt-0.5">{selectedFlag || <span className="text-error text-xs">Not selected</span>}</p>
                </div>
                <div>
                  <p className="text-muted text-xs">Variants</p>
                  <p className="font-mono text-foreground mt-0.5">control / test (50 / 50)</p>
                </div>
                <div>
                  <p className="text-muted text-xs">Simulated users</p>
                  <p className="font-mono text-foreground mt-0.5">{userCount}</p>
                </div>
                <div>
                  <p className="text-muted text-xs">Action</p>
                  <p className="font-mono text-foreground mt-0.5">{actionInfo.label}</p>
                </div>
                <div>
                  <p className="text-muted text-xs">Conversion rate</p>
                  <p className="font-mono text-foreground mt-0.5">{conversionPct}%</p>
                </div>
              </div>
              <button
                onClick={runExperiment}
                disabled={!selectedFlag || !isInitialized}
                className="w-full py-3 bg-primary hover:bg-primary-hover text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="bg-card border border-border rounded-xl p-10 flex flex-col items-center text-center space-y-6">
            <div className="text-5xl animate-pulse">🧪</div>
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-1">Running experiment…</h2>
              <p className="text-muted text-sm">
                Building event batch for <code className="font-mono text-primary">{selectedFlag}</code>
              </p>
            </div>
            <div className="w-full max-w-sm">
              <div className="flex justify-between text-xs text-muted mb-1">
                <span>Progress</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-3 bg-input-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <p className="text-muted text-xs">
              Sending {userCount} users via PostHog batch API — your session is unaffected.
            </p>
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
            <div className="flex items-center gap-3 px-4 py-3 bg-card border border-primary/20 rounded-xl">
              <span className="text-muted text-sm">Experiment flag:</span>
              <code className="font-mono text-primary font-semibold">{selectedFlag}</code>
              <span className="text-muted text-xs">· {userCount} users · {conversionPct}% target conversion</span>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{results.length}</p>
                <p className="text-xs text-muted mt-1">Total users</p>
              </div>
              <div className="bg-card border border-success/30 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-success">{results.filter((u) => u.actionCompleted).length}</p>
                <p className="text-xs text-muted mt-1">Converted</p>
              </div>
              <div className="bg-card border border-primary/30 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-primary">
                  {results.length > 0
                    ? `${Math.round((results.filter((u) => u.actionCompleted).length / results.length) * 100)}%`
                    : "—"}
                </p>
                <p className="text-xs text-muted mt-1">Actual conversion rate</p>
              </div>
            </div>

            {/* Per-variant breakdown */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="text-sm font-semibold text-foreground mb-3">Variant breakdown</h3>
              <div className="grid grid-cols-2 gap-3">
                {VARIANTS.map((v) => {
                  const group = results.filter((u) => u.variant === v);
                  const converted = group.filter((u) => u.actionCompleted).length;
                  return (
                    <div key={v} className="bg-input-bg border border-border rounded-lg p-3">
                      <p className="font-mono text-sm text-foreground font-medium">{v}</p>
                      <p className="text-xs text-muted mt-1">{group.length} users · {converted} converted</p>
                      <p className="text-xs font-semibold text-primary mt-0.5">
                        {group.length > 0 ? `${Math.round((converted / group.length) * 100)}%` : "—"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Results table */}
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">User results</h3>
                <a
                  href={experimentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2 px-4 bg-primary/20 hover:bg-primary/30 text-primary font-medium rounded-lg transition-colors text-xs"
                >
                  View in PostHog →
                </a>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-xs text-muted font-semibold pb-2 pr-4">Username</th>
                      <th className="text-left text-xs text-muted font-semibold pb-2 pr-4">Variant</th>
                      <th className="text-left text-xs text-muted font-semibold pb-2">{actionInfo.label}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((u) => (
                      <tr key={u.username} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 pr-4 font-mono text-xs text-foreground">{u.username}</td>
                        <td className="py-1.5 pr-4">
                          <span className={`px-2 py-0.5 text-xs rounded font-mono ${
                            u.variant === "control"
                              ? "bg-muted/20 text-muted"
                              : "bg-accent/10 text-accent"
                          }`}>
                            {u.variant}
                          </span>
                        </td>
                        <td className="py-1.5">
                          {u.actionCompleted
                            ? <span className="text-success font-semibold text-base" title="Completed">✓</span>
                            : <span className="text-muted/40 text-base" title="Not completed">—</span>}
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

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium animate-fade-in ${
                toast.type === "success"
                  ? "bg-success text-white"
                  : toast.type === "error"
                    ? "bg-error text-white"
                    : "bg-accent text-white"
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
