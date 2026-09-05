"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { usePosthog } from "@/contexts/PosthogContext";
import Navbar from "@/components/Navbar";
import HedgehogGif from "@/components/HedgehogGif";
import ToastStack from "@/components/ToastStack";
import { useToast } from "@/hooks/useToast";
import { FLOWS, findFlow, avgEventsPerUser, type Flow } from "@/lib/journeys";
import {
  generateUsername,
  buildPersonProps,
  buildProtocolMarkerEvent,
  newSessionId,
  flagAttributionProps,
  type ProfilePreset,
} from "@/lib/simulatedUsers";
import { TIMING_MODES, planSessionTimestamps, type TimingMode } from "@/lib/timing";
import { BatchSendError, fetchFlagsForUsers, sendEventBatch } from "@/lib/posthogIngest";

// ── Constants ────────────────────────────────────────────────────────────────

const QUICK_USER_COUNTS = [10, 25, 50, 100, 200, 500];

const PROFILE_PRESETS: { id: ProfilePreset; label: string; emoji: string; description: string }[] = [
  { id: "casual", label: "Casual", emoji: "🦔", description: "Free plan, low activity." },
  { id: "power_user", label: "Power User", emoji: "⚡", description: "Pro plan, frequent sessions." },
  { id: "enterprise", label: "Enterprise", emoji: "🏢", description: "Enterprise plan, multi-seat." },
];

type WizardStep = "configure" | "running" | "results";
type FlagMode = "all" | "one";

interface JourneyResultUser {
  username: string;
  flowId: string;
  eventsFired: number;
  firstFlagValue: string;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function JourneysPage() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { featureFlags, flagsReady, isInitialized, captureEvent, addLog, config } = usePosthog();
  const router = useRouter();

  // Wizard state
  const [step, setStep] = useState<WizardStep>("configure");

  // Step 1: flow selection (multi-select)
  const [selectedFlowIds, setSelectedFlowIds] = useState<string[]>(["shopper"]);

  // Step 2: user count
  const [userCount, setUserCount] = useState(50);

  // Step 3: profile preset
  const [preset, setPreset] = useState<ProfilePreset>("casual");

  // Step 4: flag exposure
  const [flagMode, setFlagMode] = useState<FlagMode>("all");
  const [flagToBind, setFlagToBind] = useState<string>("");

  // Step 5: timing spread
  const [timingMode, setTimingMode] = useState<TimingMode>("burst");

  // Running / results state
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [results, setResults] = useState<JourneyResultUser[]>([]);
  const [eventCounts, setEventCounts] = useState<Record<string, number>>({});
  const [runError, setRunError] = useState("");

  const { toasts, showToast } = useToast();

  const flagNames = useMemo(() => Object.keys(featureFlags).sort(), [featureFlags]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) router.push("/login");
    else if (!config.apiKey) router.push("/");
  }, [isAuthenticated, isLoading, config.apiKey, router]);

  if (isLoading || !isAuthenticated || !config.apiKey) return null;

  // Effective flag count for the estimator + downstream emission decisions
  const effectiveFlagCount =
    flagNames.length === 0 ? 0 : flagMode === "all" ? flagNames.length : flagToBind ? 1 : 0;

  const estimatedEvents = userCount * avgEventsPerUser(selectedFlowIds, effectiveFlagCount);

  const toggleFlow = (id: string) => {
    setSelectedFlowIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // ── Runner ──────────────────────────────────────────────────────────────

  const runJourneys = async () => {
    if (selectedFlowIds.length === 0) return;

    setRunError("");
    setProgressLabel("Evaluating flags…");
    setProgress(0);
    setStep("running");

    captureEvent("pasture_journeys_started", {
      flows: selectedFlowIds,
      user_count: userCount,
      profile_preset: preset,
      flag_mode: flagMode,
      flag_bound: flagMode === "one" ? flagToBind : null,
      timing_mode: timingMode,
      triggered_by: user?.id,
    });

    // Pre-generate all per-user state synchronously so async decide calls
    // reference stable values (mirrors experiments/page.tsx).
    const now = Date.now();
    const plan = Array.from({ length: userCount }, (_, i) => {
      const flowId = selectedFlowIds[i % selectedFlowIds.length];
      const flow = findFlow(flowId)!;
      const username = generateUsername(i);
      return {
        username,
        flow,
        personProps: buildPersonProps(preset, username),
        flagsByName: {} as Record<string, boolean | string>,
      };
    });

    // ── Phase 1: ask PostHog which flags apply to each user ──
    setProgressLabel(`Evaluating flags… (0/${userCount})`);
    const flagsPerUser = await fetchFlagsForUsers(
      plan.map((entry) => entry.username),
      config,
      (done, total) => {
        setProgress(Math.round((done / total) * 50)); // 0–50%
        setProgressLabel(`Evaluating flags… (${done}/${total})`);
      }
    );
    flagsPerUser.forEach((flags, i) => {
      plan[i].flagsByName = flags;
    });

    // ── Phase 2: build batch ──
    setProgressLabel("Building event batch…");
    const batchEvents: Record<string, unknown>[] = [];
    const counts: Record<string, number> = {};
    const resultRows: JourneyResultUser[] = [];

    const bumpCount = (name: string) => {
      counts[name] = (counts[name] ?? 0) + 1;
    };

    for (let i = 0; i < userCount; i++) {
      const entry = plan[i];
      const { username, flow, personProps, flagsByName } = entry;

      // Feature flag exposures
      const flagEntries: [string, boolean | string][] = Object.entries(flagsByName);
      const exposedFlags =
        flagMode === "all"
          ? flagEntries
          : flagToBind && flagToBind in flagsByName
            ? [[flagToBind, flagsByName[flagToBind]] as [string, boolean | string]]
            : [];

      // $identify + the protocol marker + one event per exposed flag + the flow.
      const plannedEventCount = 2 + exposedFlags.length + flow.steps.length;
      const stamps = planSessionTimestamps(now, timingMode, i, plannedEventCount);
      let stampIndex = 0;
      const tsAt = () => stamps[stampIndex++];

      let eventCount = 0;
      const commonJourneyProps = {
        pasture_journey_flow: flow.id,
        pasture_journey_user_index: i,
        // One session ID for the whole journey, so PostHog reads it as one
        // session instead of a dozen unrelated ones.
        $session_id: newSessionId(),
        // $feature/<key> is what PostHog reads to attribute an event to a
        // variant, so funnels can be broken down by flag.
        ...flagAttributionProps(Object.fromEntries(exposedFlags)),
      };

      // Identify with the full profile…
      batchEvents.push({
        event: "$identify",
        distinct_id: username,
        timestamp: tsAt(),
        properties: {
          $set: personProps,
          ...commonJourneyProps,
        },
      });
      bumpCount("$identify");
      eventCount++;

      // …then append the protocol marker as its own `$set` event so the
      // "this user came from the Journeys page" tag is decoupled from the
      // shared person-profile shape.
      batchEvents.push(buildProtocolMarkerEvent(username, "pasture_journey", tsAt()));
      bumpCount("$set");
      eventCount++;


      for (const [flagName, flagValue] of exposedFlags) {
        batchEvents.push({
          event: "$feature_flag_called",
          distinct_id: username,
          timestamp: tsAt(),
          properties: {
            $feature_flag: flagName,
            $feature_flag_response: flagValue,
            ...commonJourneyProps,
          },
        });
        bumpCount("$feature_flag_called");
        eventCount++;
      }

      // Flow steps
      for (const fStep of flow.steps) {
        const dynamic = fStep.dynamicProps ? fStep.dynamicProps() : {};
        batchEvents.push({
          event: fStep.event,
          distinct_id: username,
          timestamp: tsAt(),
          properties: {
            ...(fStep.props ?? {}),
            ...dynamic,
            ...commonJourneyProps,
          },
        });
        bumpCount(fStep.event);
        eventCount++;
      }

      const firstFlag = flagEntries[0];
      resultRows.push({
        username,
        flowId: flow.id,
        eventsFired: eventCount,
        firstFlagValue: firstFlag ? `${firstFlag[0]}=${String(firstFlag[1])}` : "—",
      });
    }

    setProgress(55);
    setProgressLabel(`Sending ${batchEvents.length} events to PostHog…`);
    await new Promise((r) => setTimeout(r, 0));

    // ── Phase 3: send the events, in chunks ──
    try {
      await sendEventBatch(batchEvents, config, (sent, total) => {
        setProgress(55 + Math.round((sent / total) * 45));
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
    setResults(resultRows);
    setEventCounts(counts);

    const flowCounts: Record<string, number> = {};
    for (const r of resultRows) flowCounts[r.flowId] = (flowCounts[r.flowId] ?? 0) + 1;

    captureEvent("pasture_journeys_completed", {
      flows: selectedFlowIds,
      user_count: userCount,
      total_events: batchEvents.length,
      events_by_name: counts,
      users_by_flow: flowCounts,
    });

    // Local-only summary entry so the Event Log shows the run at a glance
    // without flooding it with one entry per simulated event.
    addLog({
      type: "journey",
      name: "Journeys run summary",
      properties: {
        flows: selectedFlowIds,
        user_count: userCount,
        total_events: batchEvents.length,
        events_by_name: counts,
        users_by_flow: flowCounts,
      },
    });

    setStep("results");
    showToast(`Done — ${userCount} users journeyed (${batchEvents.length} events sent)`);
  };

  // ── PostHog persons URL ──
  const posthogHost = config.apiHost.includes("eu.")
    ? "https://eu.posthog.com"
    : "https://us.posthog.com";
  const personsUrl = `${posthogHost}/persons`;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Journeys</h1>
            <p className="text-muted text-sm">
              Simulate end-to-end user journeys. Each user gets a random identity, fetches feature flags, runs the
              flow, and logs out — without affecting your own session.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {step !== "configure" && (
              <button
                onClick={() => {
                  setStep("configure");
                  setResults([]);
                  setEventCounts({});
                  setProgress(0);
                  setRunError("");
                  setProgressLabel("");
                }}
                className="py-2.5 px-4 bg-brown/20 hover:bg-brown/30 text-brown-hover font-medium rounded-lg transition-colors text-sm"
              >
                ← New Run
              </button>
            )}
            <HedgehogGif index={1} size="sm" />
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

        {/* ── Configure ── */}
        {step === "configure" && (
          <div className="space-y-6">
            {/* 1. Flows */}
            <section className="bg-card border border-brown/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-6 h-6 rounded-full bg-brown text-white text-xs font-bold flex items-center justify-center shrink-0">
                  1
                </span>
                <h2 className="text-base font-semibold text-foreground">Choose journeys</h2>
                <span className="ml-auto text-xs text-muted">
                  {selectedFlowIds.length} of {FLOWS.length} selected
                </span>
              </div>
              <p className="text-muted text-xs mb-3 ml-9">
                Select one or more flows. With multiple selected, simulated users are split across them round-robin.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 ml-9">
                {FLOWS.map((flow) => {
                  const selected = selectedFlowIds.includes(flow.id);
                  return (
                    <button
                      key={flow.id}
                      onClick={() => toggleFlow(flow.id)}
                      className={`min-w-0 overflow-hidden px-3 py-2.5 rounded-lg border text-left transition-colors ${
                        selected
                          ? "bg-brown border-brown text-white"
                          : "bg-brown/10 border-brown/30 text-brown-hover hover:bg-brown/20"
                      }`}
                    >
                      <span className="block text-sm font-semibold truncate">
                        {flow.emoji} {flow.label}
                      </span>
                      <span
                        className={`block text-xs mt-0.5 ${selected ? "text-white/80" : "text-brown-hover/80"}`}
                      >
                        {flow.description}
                      </span>
                      <span
                        className={`block text-xs font-mono mt-1 truncate ${selected ? "text-white/70" : "text-brown-hover/70"}`}
                        title={flowStepsPreview(flow)}
                      >
                        {flow.steps.length} steps
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 2. User count */}
            <section className="bg-card border border-brown/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-6 h-6 rounded-full bg-brown text-white text-xs font-bold flex items-center justify-center shrink-0">
                  2
                </span>
                <h2 className="text-base font-semibold text-foreground">Number of simulated users</h2>
              </div>
              <div className="flex items-center gap-4 ml-9 flex-wrap">
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={userCount}
                  onChange={(e) =>
                    setUserCount(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))
                  }
                  className="w-24 px-4 py-2.5 bg-input-bg border border-brown/30 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brown text-sm font-mono"
                />
                <div className="flex gap-2 flex-wrap">
                  {QUICK_USER_COUNTS.map((n) => (
                    <button
                      key={n}
                      onClick={() => setUserCount(n)}
                      className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                        userCount === n
                          ? "bg-brown border-brown text-white"
                          : "bg-brown/10 hover:bg-brown/20 text-brown-hover border-brown/30"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted mt-2 ml-9">
                Max 500 users. Each user gets their own randomly-generated identity.
              </p>
            </section>

            {/* 3. Profile preset */}
            <section className="bg-card border border-brown/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-6 h-6 rounded-full bg-brown text-white text-xs font-bold flex items-center justify-center shrink-0">
                  3
                </span>
                <h2 className="text-base font-semibold text-foreground">Person profile preset</h2>
              </div>
              <p className="text-muted text-xs mb-3 ml-9">
                Drives the person properties set on each simulated user via <code className="font-mono">$identify</code>.
              </p>
              <div className="grid grid-cols-3 gap-2 ml-9">
                {PROFILE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPreset(p.id)}
                    className={`min-w-0 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                      preset === p.id
                        ? "bg-brown border-brown text-white"
                        : "bg-brown/10 border-brown/30 text-brown-hover hover:bg-brown/20"
                    }`}
                  >
                    <span className="block text-sm font-semibold">
                      {p.emoji} {p.label}
                    </span>
                    <span
                      className={`block text-xs mt-0.5 ${preset === p.id ? "text-white/80" : "text-brown-hover/80"}`}
                    >
                      {p.description}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {/* 4. Flag exposure */}
            {flagNames.length > 0 && (
              <section className="bg-card border border-brown/30 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-6 h-6 rounded-full bg-brown text-white text-xs font-bold flex items-center justify-center shrink-0">
                    4
                  </span>
                  <h2 className="text-base font-semibold text-foreground">Feature flag exposure</h2>
                </div>
                <p className="text-muted text-xs mb-3 ml-9">
                  Whether to fire <code className="font-mono">$feature_flag_called</code> for every flag returned, or
                  just one specific flag.
                </p>
                <div className="flex items-center gap-3 ml-9 flex-wrap">
                  <button
                    onClick={() => setFlagMode("all")}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      flagMode === "all"
                        ? "bg-brown border-brown text-white"
                        : "bg-brown/10 hover:bg-brown/20 text-brown-hover border-brown/30"
                    }`}
                  >
                    All flags ({flagNames.length})
                  </button>
                  <button
                    onClick={() => setFlagMode("one")}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      flagMode === "one"
                        ? "bg-brown border-brown text-white"
                        : "bg-brown/10 hover:bg-brown/20 text-brown-hover border-brown/30"
                    }`}
                  >
                    One flag
                  </button>
                  {flagMode === "one" && (
                    <select
                      value={flagToBind}
                      onChange={(e) => setFlagToBind(e.target.value)}
                      className="px-3 py-2 bg-input-bg border border-brown/30 rounded-lg text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brown"
                    >
                      <option value="">Select a flag…</option>
                      {flagNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {!flagsReady && (
                  <p className="text-xs text-muted mt-2 ml-9">Flags still loading…</p>
                )}
              </section>
            )}

            {/* 5. Timing spread */}
            <section className="bg-card border border-brown/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-6 h-6 rounded-full bg-brown text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {flagNames.length > 0 ? 5 : 4}
                </span>
                <h2 className="text-base font-semibold text-foreground">Event timing</h2>
              </div>
              <p className="text-muted text-xs mb-3 ml-9">
                Spread session start times and event gaps so PostHog trends look natural instead of a single tall spike.
                All spread is into the past — PostHog rejects timestamps far in the future.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 ml-9">
                {TIMING_MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setTimingMode(m.id)}
                    className={`min-w-0 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                      timingMode === m.id
                        ? "bg-brown border-brown text-white"
                        : "bg-brown/10 border-brown/30 text-brown-hover hover:bg-brown/20"
                    }`}
                  >
                    <span className="block text-sm font-semibold">{m.label}</span>
                    <span
                      className={`block text-xs mt-0.5 ${timingMode === m.id ? "text-white/80" : "text-brown-hover/80"}`}
                    >
                      {m.description}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {/* Summary + Start */}
            <div className="bg-card border border-brown/30 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-foreground mb-3">Summary</h3>
              <div className="grid grid-cols-2 gap-3 text-sm mb-5">
                <div>
                  <p className="text-muted text-xs">Flows</p>
                  <p className="font-mono text-foreground mt-0.5">
                    {selectedFlowIds.length === 0 ? (
                      <span className="text-error text-xs">None selected</span>
                    ) : (
                      selectedFlowIds.join(", ")
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-muted text-xs">Simulated users</p>
                  <p className="font-mono text-foreground mt-0.5">{userCount}</p>
                </div>
                <div>
                  <p className="text-muted text-xs">Profile preset</p>
                  <p className="font-mono text-foreground mt-0.5">{preset}</p>
                </div>
                <div>
                  <p className="text-muted text-xs">Estimated events</p>
                  <p className="font-mono text-foreground mt-0.5">≈ {estimatedEvents.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted text-xs">Event timing</p>
                  <p className="font-mono text-foreground mt-0.5">
                    {TIMING_MODES.find((m) => m.id === timingMode)?.label ?? timingMode}
                  </p>
                </div>
              </div>
              <button
                onClick={runJourneys}
                disabled={selectedFlowIds.length === 0 || !isInitialized}
                className="w-full py-3 bg-brown hover:bg-brown-hover text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🛤️ Start Journeys
              </button>
              {selectedFlowIds.length === 0 && (
                <p className="text-error text-xs mt-2 text-center">Pick at least one flow to continue</p>
              )}
            </div>
          </div>
        )}

        {/* ── Running ── */}
        {step === "running" && (
          <div className="bg-card border border-brown/30 rounded-xl p-10 flex flex-col items-center text-center space-y-6">
            <div className="text-5xl animate-pulse">🛤️</div>
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-1">Running journeys…</h2>
              <p className="text-muted text-sm">
                {progressLabel || "Working…"}
              </p>
            </div>
            <div className="w-full max-w-sm">
              <div className="flex justify-between text-xs text-muted mb-1">
                <span>{progressLabel || "Working…"}</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-3 bg-input-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-brown rounded-full transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <div className="text-muted text-xs space-y-1">
              <p>Phase 1 (0–60%): Evaluating flags per user</p>
              <p>Phase 2 (60–80%): Building event batch</p>
              <p>Phase 3 (80–100%): Sending to PostHog</p>
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {step === "results" && (
          <div className="space-y-4">
            {runError && (
              <div className="bg-error/10 border border-error/30 rounded-lg p-4 text-error text-sm">
                <strong>Batch send error:</strong> {runError}
              </div>
            )}

            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Total users" value={results.length.toLocaleString()} />
              <StatCard
                label="Total events"
                value={Object.values(eventCounts).reduce((a, b) => a + b, 0).toLocaleString()}
              />
              <StatCard
                label="Flows used"
                value={String(new Set(results.map((r) => r.flowId)).size)}
              />
              <StatCard
                label="Avg events / user"
                value={
                  results.length > 0
                    ? (
                        Object.values(eventCounts).reduce((a, b) => a + b, 0) / results.length
                      ).toFixed(1)
                    : "—"
                }
              />
            </div>

            {/* Flow breakdown */}
            <div className="bg-card border border-brown/30 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-foreground mb-3">Flow breakdown</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[...new Set(results.map((r) => r.flowId))].map((flowId) => {
                  const flow = findFlow(flowId);
                  const group = results.filter((r) => r.flowId === flowId);
                  const pct = results.length > 0 ? (group.length / results.length) * 100 : 0;
                  return (
                    <div key={flowId} className="bg-input-bg border border-brown/20 rounded-lg p-3">
                      <span className="block text-sm font-medium text-foreground">
                        {flow?.emoji} {flow?.label ?? flowId}
                      </span>
                      <p className="text-xs text-muted mt-1">{group.length} users</p>
                      <p className="text-xs font-semibold text-brown-hover mt-0.5">{pct.toFixed(1)}%</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Per-event totals */}
            <div className="bg-card border border-brown/30 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-foreground mb-3">Events sent</h3>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border">
                      <th className="text-left text-xs text-muted font-semibold pb-2 pr-4">Event</th>
                      <th className="text-right text-xs text-muted font-semibold pb-2">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(eventCounts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([name, count]) => (
                        <tr key={name} className="border-b border-border/50 last:border-0">
                          <td className="py-1.5 pr-4 font-mono text-xs text-foreground">{name}</td>
                          <td className="py-1.5 text-right font-mono text-xs text-brown-hover">
                            {count.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sample user table */}
            <div className="bg-card border border-brown/30 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">User runs</h3>
                <a
                  href={personsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2 px-4 bg-brown/20 hover:bg-brown/30 text-brown-hover font-medium rounded-lg transition-colors text-xs"
                >
                  View persons in PostHog →
                </a>
              </div>
              <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border">
                      <th className="text-left text-xs text-muted font-semibold pb-2 pr-4">Username</th>
                      <th className="text-left text-xs text-muted font-semibold pb-2 pr-4">Flow</th>
                      <th className="text-right text-xs text-muted font-semibold pb-2 pr-4">Events</th>
                      <th className="text-left text-xs text-muted font-semibold pb-2">First flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.username} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 pr-4 font-mono text-xs text-foreground">{r.username}</td>
                        <td className="py-1.5 pr-4">
                          <span className="px-2 py-0.5 text-xs rounded font-mono bg-brown/20 text-brown-hover">
                            {r.flowId}
                          </span>
                        </td>
                        <td className="py-1.5 pr-4 text-right font-mono text-xs text-foreground">
                          {r.eventsFired}
                        </td>
                        <td className="py-1.5 font-mono text-xs text-muted">{r.firstFlagValue}</td>
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function flowStepsPreview(flow: Flow): string {
  return flow.steps.map((s) => s.event).join(" → ");
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-brown/30 rounded-xl p-4 text-center">
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted mt-1">{label}</p>
    </div>
  );
}
