"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { usePosthog } from "@/contexts/PosthogContext";
import Navbar from "@/components/Navbar";
import posthog from "posthog-js";

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
  { label: "Checkout Started", event: "pasture_checkout_started", props: { cart_value: 49.99 } },
  { label: "Feature Used", event: "pasture_feature_used", props: { feature: "experiment_feature" } },
  { label: "Form Submitted", event: "pasture_form_submitted", props: { form_name: "experiment_form" } },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExperimentUser {
  username: string;
  variant: string | boolean;
  actionCompleted: boolean;
}

type WizardStep = "configure" | "running" | "results";

export default function ExperimentsPage() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { featureFlags, flagsReady, isInitialized, captureEvent, config } = usePosthog();
  const router = useRouter();

  // ── Wizard state ──
  const [step, setStep] = useState<WizardStep>("configure");

  // Step 1: flag selection
  const [selectedFlag, setSelectedFlag] = useState("");

  // Step 2: variants
  const [variants, setVariants] = useState<string[]>(["control", "test"]);
  const [newVariant, setNewVariant] = useState("");

  // Step 3: user count
  const [userCount, setUserCount] = useState(50);

  // Step 4: conversion action
  const [selectedAction, setSelectedAction] = useState(CONVERSION_ACTIONS[0].event);

  // Step 5: conversion %
  const [conversionMode, setConversionMode] = useState<"random" | "fixed">("random");
  const [conversionPct, setConversionPct] = useState(25);

  // Running state
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ExperimentUser[]>([]);

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

  const flagNames = Object.keys(featureFlags).sort();
  const actionInfo = CONVERSION_ACTIONS.find((a) => a.event === selectedAction) || CONVERSION_ACTIONS[0];

  // ── Variant helpers ──

  const addVariant = () => {
    const v = newVariant.trim();
    if (v && !variants.includes(v)) {
      setVariants((prev) => [...prev, v]);
    }
    setNewVariant("");
  };

  const removeVariant = (v: string) => {
    if (variants.length > 1) setVariants((prev) => prev.filter((x) => x !== v));
  };

  // Pre-fill variants when a flag is selected
  const handleFlagSelect = (key: string) => {
    setSelectedFlag(key);
    const val = featureFlags[key];
    if (typeof val === "boolean") {
      setVariants(["true", "false"]);
    } else if (typeof val === "string" && val) {
      // Show known value + control as defaults
      const known = new Set(["control", val]);
      setVariants([...known]);
    } else {
      setVariants(["control", "test"]);
    }
  };

  // ── Experiment runner ──

  const runExperiment = async () => {
    if (!selectedFlag || variants.length === 0) return;

    const pct = conversionMode === "random"
      ? Math.floor(Math.random() * 100) + 1
      : conversionPct;

    // Capture experiment start event for the current logged-in user
    captureEvent("pasture_experiment_started", {
      flag: selectedFlag,
      variants,
      user_count: userCount,
      conversion_action: selectedAction,
      conversion_pct: pct,
      triggered_by: user?.id,
    });

    setStep("running");
    setProgress(0);

    const generated: ExperimentUser[] = [];

    for (let i = 0; i < userCount; i++) {
      const username = generateUsername(i);
      const variant = variants[i % variants.length];
      const actionCompleted = Math.random() * 100 < pct;

      // Identify this simulated user
      posthog.identify(username, { experiment_user: true, variant });

      // Fire $feature_flag_called for this flag
      posthog.capture("$feature_flag_called", {
        $feature_flag: selectedFlag,
        $feature_flag_response: variant,
      });

      // Fire the conversion action if they "converted"
      if (actionCompleted) {
        posthog.capture(actionInfo.event, {
          ...actionInfo.props,
          experiment_flag: selectedFlag,
          variant,
          simulated_user: username,
        });
      }

      generated.push({ username, variant, actionCompleted });

      // Update progress and yield to React every 10 users
      if (i % 10 === 9 || i === userCount - 1) {
        setProgress(Math.round(((i + 1) / userCount) * 100));
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    // Restore the original logged-in user identity
    if (user && !user.isGuest) {
      posthog.identify(user.id, { email: user.email, name: user.name });
    } else {
      posthog.reset();
    }

    setResults(generated);

    captureEvent("pasture_experiment_completed", {
      flag: selectedFlag,
      user_count: userCount,
      conversion_action: selectedAction,
      conversion_pct: pct,
      converted_count: generated.filter((u) => u.actionCompleted).length,
    });

    setStep("results");
    showToast(`Experiment complete — ${generated.filter((u) => u.actionCompleted).length}/${userCount} converted`);
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
              Generate realistic experiment data — identify simulated users, assign variants, and fire conversion events.
            </p>
          </div>
          {step !== "configure" && (
            <button
              onClick={() => { setStep("configure"); setResults([]); setProgress(0); }}
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

            {/* 1. Flag selection */}
            <section className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">1</span>
                <h2 className="text-base font-semibold text-foreground">Select a feature flag</h2>
              </div>
              {!flagsReady ? (
                <p className="text-muted text-sm">Loading flags... make sure PostHog is connected.</p>
              ) : flagNames.length === 0 ? (
                <p className="text-muted text-sm">No feature flags found in your project.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {flagNames.map((key) => (
                    <button
                      key={key}
                      onClick={() => handleFlagSelect(key)}
                      className={`px-3 py-2.5 rounded-lg border text-sm font-mono text-left transition-colors ${
                        selectedFlag === key
                          ? "bg-primary/20 border-primary text-primary"
                          : "bg-input-bg border-border text-foreground hover:border-primary/50"
                      }`}
                    >
                      {key}
                      <span className="block text-xs text-muted font-sans mt-0.5">
                        {typeof featureFlags[key] === "boolean"
                          ? featureFlags[key] ? "true" : "false"
                          : String(featureFlags[key] || "—")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* 2. Variants */}
            <section className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">2</span>
                <h2 className="text-base font-semibold text-foreground">Variants</h2>
              </div>
              <p className="text-muted text-xs mb-3">
                Users will be distributed evenly across these variants. Selecting a flag above pre-fills sensible defaults.
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {variants.map((v) => (
                  <span key={v} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/10 border border-accent/30 rounded-lg text-accent text-sm font-mono">
                    {v}
                    <button
                      onClick={() => removeVariant(v)}
                      className="text-accent/60 hover:text-error transition-colors text-xs ml-1"
                      title="Remove variant"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newVariant}
                  onChange={(e) => setNewVariant(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addVariant()}
                  placeholder="Add variant..."
                  className="flex-1 px-3 py-2 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm font-mono"
                />
                <button
                  onClick={addVariant}
                  className="px-4 py-2 bg-accent/20 hover:bg-accent/30 text-accent font-medium rounded-lg transition-colors text-sm"
                >
                  Add
                </button>
              </div>
            </section>

            {/* 3. User count */}
            <section className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">3</span>
                <h2 className="text-base font-semibold text-foreground">Number of simulated users</h2>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={userCount}
                  onChange={(e) => setUserCount(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
                  className="w-32 px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm font-mono"
                />
                <div className="flex gap-2">
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
              <p className="text-xs text-muted mt-2">Max 500 users per run.</p>
            </section>

            {/* 4. Conversion action */}
            <section className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">4</span>
                <h2 className="text-base font-semibold text-foreground">Conversion action</h2>
              </div>
              <p className="text-muted text-xs mb-3">The event fired for users who convert in the experiment.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CONVERSION_ACTIONS.map((action) => (
                  <button
                    key={action.event}
                    onClick={() => setSelectedAction(action.event)}
                    className={`px-3 py-2.5 rounded-lg border text-sm text-left transition-colors ${
                      selectedAction === action.event
                        ? "bg-success/20 border-success text-success"
                        : "bg-input-bg border-border text-foreground hover:border-success/50"
                    }`}
                  >
                    <span className="font-medium">{action.label}</span>
                    <span className="block text-xs text-muted font-mono mt-0.5">{action.event}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* 5. Conversion % */}
            <section className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">5</span>
                <h2 className="text-base font-semibold text-foreground">Conversion rate</h2>
              </div>
              <p className="text-muted text-xs mb-4">
                Percentage of users who complete the conversion action.
              </p>
              <div className="flex gap-3 mb-4">
                <button
                  onClick={() => setConversionMode("random")}
                  className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    conversionMode === "random"
                      ? "bg-warning/20 border-warning text-warning"
                      : "bg-input-bg border-border text-muted hover:border-warning/50"
                  }`}
                >
                  🎲 Random percentage
                </button>
                <button
                  onClick={() => setConversionMode("fixed")}
                  className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    conversionMode === "fixed"
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-input-bg border-border text-muted hover:border-primary/50"
                  }`}
                >
                  Set percentage
                </button>
              </div>
              {conversionMode === "fixed" && (
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={conversionPct}
                    onChange={(e) => setConversionPct(parseInt(e.target.value))}
                    className="flex-1 accent-primary"
                  />
                  <span className="w-16 text-center text-foreground font-mono font-semibold text-lg">{conversionPct}%</span>
                </div>
              )}
              {conversionMode === "random" && (
                <p className="text-muted text-xs">A random percentage between 1–100% will be generated when you start.</p>
              )}
            </section>

            {/* Summary + Start */}
            <div className="bg-card border border-primary/30 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-foreground mb-3">Summary</h3>
              <div className="grid grid-cols-2 gap-3 text-sm mb-5">
                <div className="space-y-1">
                  <p className="text-muted text-xs">Flag</p>
                  <p className="font-mono text-foreground">{selectedFlag || <span className="text-error">Not selected</span>}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted text-xs">Variants</p>
                  <p className="font-mono text-foreground">{variants.join(", ") || <span className="text-error">None</span>}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted text-xs">Simulated users</p>
                  <p className="font-mono text-foreground">{userCount}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted text-xs">Action</p>
                  <p className="font-mono text-foreground">{actionInfo.label}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted text-xs">Conversion rate</p>
                  <p className="font-mono text-foreground">{conversionMode === "random" ? "🎲 Random" : `${conversionPct}%`}</p>
                </div>
              </div>
              <button
                onClick={runExperiment}
                disabled={!selectedFlag || variants.length === 0 || !isInitialized}
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
              <p className="text-muted text-sm">Identifying users and firing events for <code className="font-mono text-primary">{selectedFlag}</code></p>
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
            <p className="text-muted text-xs">Please wait — this sends real events to PostHog.</p>
          </div>
        )}

        {/* ── Results step ── */}
        {step === "results" && (
          <div className="space-y-4">
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
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {variants.map((v) => {
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
                          <span className="px-2 py-0.5 bg-accent/10 text-accent text-xs rounded font-mono">{String(u.variant)}</span>
                        </td>
                        <td className="py-1.5">
                          {u.actionCompleted
                            ? <span className="text-success font-semibold text-base" title="Completed">✓</span>
                            : <span className="text-muted text-base" title="Not completed">—</span>}
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
