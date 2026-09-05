"use client";

import { useEffect, useState } from "react";
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
  newSessionId,
  flagExposureProps,
  simulatedPersonsUrl,
} from "@/lib/simulatedUsers";
import { TIMING_MODES, planSessionTimestamps, type TimingMode } from "@/lib/timing";
import { buildVariantRates, pickControlVariant } from "@/lib/experimentRates";
import { BatchSendError, fetchFlagsForUsers, sendEventBatch } from "@/lib/posthogIngest";

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

  // Step 4: baseline conversion % for the control variant
  const [conversionPct, setConversionPct] = useState(20);
  // How much better the test variant converts, as a relative percentage.
  const [variantLiftPct, setVariantLiftPct] = useState(25);

  // Step 5: timing spread
  const [timingMode, setTimingMode] = useState<TimingMode>("burst");

  // Running state
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [results, setResults] = useState<ExperimentUser[]>([]);
  const [runError, setRunError] = useState("");

  // Toast
  const { toasts, showToast } = useToast();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) router.push("/login");
    else if (!config.apiKey) router.push("/");
  }, [isAuthenticated, isLoading, config.apiKey, router]);

  if (isLoading || !isAuthenticated || !config.apiKey) return null;

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
      variant_lift_pct: variantLiftPct,
      timing_mode: timingMode,
      triggered_by: user?.id,
    });

    const now = Date.now();
    const usernames = Array.from({ length: userCount }, (_, i) => generateUsername(i));

    // ── Phase 1: ask PostHog which variant each user gets ──
    // PostHog evaluates the rollout rules against the distinct_id, so this is
    // the real assignment rather than something the sandbox picks.
    setProgressLabel(`Evaluating flags… (0/${userCount})`);
    const flagsPerUser = await fetchFlagsForUsers(usernames, config, (done, total) => {
      setProgress(Math.round((done / total) * 60)); // 0–60% = flag phase
      setProgressLabel(`Evaluating flags… (${done}/${total})`);
    });
    const variants = flagsPerUser.map((flags) => flags[selectedFlag] ?? false);

    // ── Phase 2: Build the batch payload ──
    setProgressLabel("Building event batch…");
    const generated: ExperimentUser[] = [];
    const batchEvents: Record<string, unknown>[] = [];

    // Conversion is decided per variant, not once for the whole run. With a
    // single rate every variant converts at the same rate by construction, so
    // PostHog could never call a winner on generated data.
    const rateForVariant = buildVariantRates(variants, conversionPct, variantLiftPct);

    for (let i = 0; i < userCount; i++) {
      const username = usernames[i];
      const variant = String(variants[i]);
      const actionCompleted = Math.random() * 100 < rateForVariant(variant);
      // $identify + the protocol marker + the exposure, plus the conversion.
      const stamps = planSessionTimestamps(now, timingMode, i, actionCompleted ? 4 : 3);
      let stampIndex = 0;
      const tsAt = () => stamps[stampIndex++];
      // One session ID per user, so PostHog groups the run as one session
      // instead of four unrelated ones.
      const sessionProps = { $session_id: newSessionId() };

      // Step 2: Identify the user in PostHog with a full profile (plan,
      // monthly_sessions, …) — the preset is randomised per user so an
      // experiment run produces a realistic mix of personas.
      batchEvents.push({
        event: "$identify",
        distinct_id: username,
        timestamp: tsAt(),
        properties: {
          $set: buildPersonProps(randomProfilePreset(), username),
          ...sessionProps,
        },
      });

      // Append the protocol marker as its own `$set` event so the
      // "this user came from the Experiments page" tag stays decoupled from
      // the shared person-profile shape.
      batchEvents.push(buildProtocolMarkerEvent(username, "pasture_experiment", tsAt(), sessionProps));

      // Step 3: Record flag exposure with the variant PostHog assigned
      batchEvents.push({
        event: "$feature_flag_called",
        distinct_id: username,
        timestamp: tsAt(),
        properties: { ...flagExposureProps(selectedFlag, variants[i]), ...sessionProps },
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
          timestamp: tsAt(),
          properties: {
            ...conversionProps,
            experiment_flag: selectedFlag,
            // $feature/<key> is the property experiment analysis reads on a
            // conversion event. Without it the conversion has no variant.
            ...flagExposureProps(selectedFlag, variants[i]),
            ...sessionProps,
          },
        });
      }

      generated.push({ username, variant, actionCompleted });
    }

    setProgress(65);
    setProgressLabel(`Sending ${batchEvents.length} events to PostHog…`);
    await new Promise((r) => setTimeout(r, 0));

    // ── Phase 3: Send the events, in chunks ──
    // Each event has its own distinct_id — the real logged-in session is never touched.
    try {
      await sendEventBatch(batchEvents, config, (sent, total) => {
        setProgress(65 + Math.round((sent / total) * 35));
        setProgressLabel(`Sending events to PostHog… (${sent}/${total})`);
      });
    } catch (err) {
      const failure = err as BatchSendError;
      setRunError(
        failure.sentEvents > 0
          ? `${failure.message}. ${failure.sentEvents} of ${failure.totalEvents} events reached PostHog.`
          : failure.message
      );
    }

    setProgress(100);
    setResults(generated);

    captureEvent("pasture_experiment_completed", {
      flag: selectedFlag,
      user_count: userCount,
      conversion_action: selectedAction,
      conversion_pct: conversionPct,
      variant_lift_pct: variantLiftPct,
      converted_count: generated.filter((u) => u.actionCompleted).length,
    });

    setStep("results");
    showToast(`Done — ${generated.filter((u) => u.actionCompleted).length}/${userCount} users converted`);
  };

  // ── PostHog experiment URL ──
  const posthogHost = config.apiHost.includes("eu.") ? "https://eu.posthog.com" : "https://us.posthog.com";
  const experimentUrl = `${posthogHost}/experiments`;
  const simulatedUsersUrl = simulatedPersonsUrl(config.apiHost, "pasture_experiment");

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
                Control converts at the baseline. Test variants get the lift on top, so PostHog has a real difference
                to measure. Set the lift to 0% for a null result, or below 0% for a test variant that loses.
              </p>
              <div className="ml-9 space-y-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <label htmlFor="baseline-pct" className="text-sm text-foreground w-32 shrink-0">
                    Control baseline
                  </label>
                  <div className="flex items-center">
                    <input
                      id="baseline-pct"
                      type="number"
                      min={1}
                      max={100}
                      value={conversionPct}
                      onChange={(e) => setConversionPct(Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)))}
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
                <div className="flex items-center gap-4 flex-wrap">
                  <label htmlFor="variant-lift-pct" className="text-sm text-foreground w-32 shrink-0">
                    Test variant lift
                  </label>
                  <div className="flex items-center">
                    <input
                      id="variant-lift-pct"
                      type="number"
                      min={-100}
                      max={500}
                      value={variantLiftPct}
                      onChange={(e) =>
                        setVariantLiftPct(Math.max(-100, Math.min(500, parseInt(e.target.value, 10) || 0)))
                      }
                      className="w-24 px-4 py-2.5 bg-input-bg border border-warning/30 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-warning text-sm font-mono"
                    />
                    <span className="ml-2 text-muted text-sm">%</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {[-25, 0, 10, 25, 50, 100].map((n) => (
                      <button
                        key={n}
                        onClick={() => setVariantLiftPct(n)}
                        className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                          variantLiftPct === n
                            ? "bg-warning border-warning text-black"
                            : "bg-warning/10 hover:bg-warning/20 text-warning border-warning/30"
                        }`}
                      >
                        {n > 0 ? `+${n}` : n}%
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-muted text-xs">
                  Control converts at {conversionPct}%. The top test variant converts at{" "}
                  {Math.round(Math.min(100, Math.max(0, conversionPct * (1 + variantLiftPct / 100))))}%.
                </p>
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

            {/* Step 5: Timing */}
            <section className="bg-card border border-warning/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-6 h-6 rounded-full bg-warning text-black text-xs font-bold flex items-center justify-center shrink-0">
                  5
                </span>
                <h2 className="text-base font-semibold text-foreground">Event timing</h2>
              </div>
              <p className="text-muted text-xs mb-3 ml-9">
                Spread sessions and per-event gaps so trends look natural instead of a single tall spike. All spread is
                into the past — PostHog rejects timestamps far in the future.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 ml-9">
                {TIMING_MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setTimingMode(m.id)}
                    className={`min-w-0 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                      timingMode === m.id
                        ? "bg-warning border-warning text-black"
                        : "bg-warning/10 border-warning/30 text-warning hover:bg-warning/20"
                    }`}
                  >
                    <span className="block text-sm font-semibold">{m.label}</span>
                    <span
                      className={`block text-xs mt-0.5 ${timingMode === m.id ? "text-black/80" : "text-warning/80"}`}
                    >
                      {m.description}
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
                <div>
                  <p className="text-muted text-xs">Event timing</p>
                  <p className="font-mono text-foreground mt-0.5">
                    {TIMING_MODES.find((m) => m.id === timingMode)?.label ?? timingMode}
                  </p>
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
                · {userCount} users · {conversionPct}% control baseline · {variantLiftPct > 0 ? "+" : ""}
                {variantLiftPct}% test lift · variants assigned by PostHog
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
              const control = pickControlVariant(uniqueVariants);
              const rateOf = (variant: string) => {
                const group = results.filter((u) => u.variant === variant);
                if (group.length === 0) return null;
                return (group.filter((u) => u.actionCompleted).length / group.length) * 100;
              };
              const controlRate = control ? rateOf(control) : null;
              return (
                <div className="bg-card border border-warning/30 rounded-xl p-6">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Variant breakdown</h3>
                  <div className={`grid gap-3 ${uniqueVariants.length <= 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                    {uniqueVariants.map((v) => {
                      const group = results.filter((u) => u.variant === v);
                      const converted = group.filter((u) => u.actionCompleted).length;
                      const rate = rateOf(v);
                      const isControl = v === control;
                      const lift =
                        !isControl && rate !== null && controlRate ? ((rate - controlRate) / controlRate) * 100 : null;
                      return (
                        <div key={v} className="bg-input-bg border border-warning/20 rounded-lg p-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-block font-mono text-sm font-medium px-2 py-0.5 rounded bg-warning/20 text-warning">
                              {v}
                            </span>
                            {isControl && (
                              <span className="text-[10px] uppercase tracking-wide text-muted">control</span>
                            )}
                          </div>
                          <p className="text-xs text-muted mt-2">
                            {group.length} users · {converted} converted
                          </p>
                          <p className="text-xs font-semibold text-warning mt-0.5">
                            {rate !== null ? `${Math.round(rate)}%` : "—"}
                            {lift !== null && (
                              <span className={lift >= 0 ? "text-success ml-2" : "text-error ml-2"}>
                                {lift >= 0 ? "+" : ""}
                                {Math.round(lift)}% vs control
                              </span>
                            )}
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
                <div className="flex gap-2">
                  <a
                    href={simulatedUsersUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Every person this page created, filtered by pasture_experiment. Use it to review or delete them."
                    className="py-2 px-4 border border-border hover:border-foreground/40 text-foreground/70 hover:text-foreground font-medium rounded-lg transition-colors text-xs"
                  >
                    These persons →
                  </a>
                  <a
                    href={experimentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-4 bg-warning/20 hover:bg-warning/30 text-warning font-medium rounded-lg transition-colors text-xs"
                  >
                    View in PostHog →
                  </a>
                </div>
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
