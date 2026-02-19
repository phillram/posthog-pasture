"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { usePosthog } from "@/contexts/PosthogContext";
import Navbar from "@/components/Navbar";
import HedgehogGif from "@/components/HedgehogGif";

const hedgehogFlags = [
  {
    key: "hedgehog-hibernate",
    name: "Hedgehog Hibernate",
    description: "When enabled, this cozy hedgehog curls up for a long winter nap.",
    gifIndex: 0,
  },
  {
    key: "hedgehog-snuggle",
    name: "Hedgehog Snuggle",
    description: "When enabled, this affectionate hedgehog snuggles up for warmth.",
    gifIndex: 1,
  },
  {
    key: "hedgehog-zoomies",
    name: "Hedgehog Zoomies",
    description: "When enabled, this energetic hedgehog zooms around at full speed.",
    gifIndex: 2,
  },
];

export default function FlagsPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const { featureFlags, reloadFeatureFlags, addLog, isInitialized, config } = usePosthog();
  const router = useRouter();

  const [demoFlags, setDemoFlags] = useState<Record<string, boolean>>({
    "hedgehog-hibernate": false,
    "hedgehog-snuggle": false,
    "hedgehog-zoomies": false,
  });
  const [flagsReady, setFlagsReady] = useState(false);

  const [toasts, setToasts] = useState<{ id: string; message: string; type: "success" | "error" | "info" }[]>([]);
  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "success") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2500);
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Redirect to setup if no API key is configured
  useEffect(() => {
    if (!isLoading && isAuthenticated && !config.apiKey) {
      router.push("/");
    }
  }, [isLoading, isAuthenticated, config.apiKey, router]);

  // Use posthog.onFeatureFlags to ensure flags are loaded before evaluating
  useEffect(() => {
    let cancelled = false;
    const initFlags = async () => {
      const ph = (await import("posthog-js")).default;

      ph.onFeatureFlags(function () {
        if (cancelled) return;
        const updated: Record<string, boolean> = {};
        for (const hf of hedgehogFlags) {
          updated[hf.key] = ph.isFeatureEnabled(hf.key) === true;
        }
        setDemoFlags(updated);
        setFlagsReady(true);
        addLog({
          type: "flag",
          name: "Hedgehog Flags Evaluated",
          properties: updated,
        });
      });
    };
    initFlags();
    return () => { cancelled = true; };
  }, [addLog]);

  // Once onFeatureFlags fires, automatically reload feature flags into the context
  useEffect(() => {
    if (flagsReady && isInitialized) {
      reloadFeatureFlags();
    }
  }, [flagsReady, isInitialized, reloadFeatureFlags]);

  // Re-sync demo flags whenever featureFlags from context update (e.g. after reload/override)
  useEffect(() => {
    if (!flagsReady) return;
    const checkFlags = async () => {
      const ph = (await import("posthog-js")).default;
      const updated: Record<string, boolean> = {};
      for (const hf of hedgehogFlags) {
        updated[hf.key] = ph.isFeatureEnabled(hf.key) === true;
      }
      setDemoFlags(updated);
    };
    checkFlags();
  }, [featureFlags, flagsReady]);

  if (isLoading || !isAuthenticated) return null;

  const toggleDemoFlag = async (key: string) => {
    const ph = (await import("posthog-js")).default;
    const next = !demoFlags[key];
    ph.featureFlags.overrideFeatureFlags({ flags: { [key]: next } });
    // Verify with posthog.isFeatureEnabled after override
    const verified = ph.isFeatureEnabled(key) === true;
    setDemoFlags((prev) => ({ ...prev, [key]: verified }));
    addLog({ type: "flag", name: `Flag ${verified ? "Activated" : "Deactivated"}: ${key}`, properties: { flag: key, value: verified } });
    showToast(`"${key}" ${verified ? "activated" : "deactivated"}`);
  };

  const toggleProjectFlag = async (key: string, currentValue: boolean | string) => {
    const ph = (await import("posthog-js")).default;
    let next: boolean | string;
    if (typeof currentValue === "boolean") {
      next = !currentValue;
    } else {
      next = currentValue === "control" ? "test" : "control";
    }
    ph.featureFlags.overrideFeatureFlags({ flags: { [key]: next } });
    addLog({ type: "flag", name: `Flag ${typeof next === "boolean" ? (next ? "Activated" : "Deactivated") : "Switched"}: ${key}`, properties: { flag: key, from: currentValue, to: next } });
    reloadFeatureFlags();
    showToast(`"${key}" ${typeof next === "boolean" ? (next ? "activated" : "deactivated") : `switched to "${next}"`}`);
  };

  const activeFlags = Object.entries(featureFlags)
    .filter(([, value]) => value === true || (typeof value === "string" && value !== "false"))
    .sort(([a], [b]) => a.localeCompare(b));

  const allFlags = Object.entries(featureFlags).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Flags & Experiments</h1>
            <p className="text-muted text-sm">Toggle feature flags, run experiments, and watch hedgehogs react.</p>
          </div>
          <HedgehogGif index={4} size="sm" />
        </div>

        {/* ── Hedgehog Feature Flag Demo ── */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 bg-warning rounded-full" />
            <h2 className="text-lg font-semibold text-foreground">Hedgehog Feature Flags</h2>
          </div>
          <p className="text-muted text-sm mb-4">
            Each flag reveals a different hedgehog. Toggle them on and off to see who appears!
            {!flagsReady && <span className="ml-2 text-warning text-xs">(Waiting for flags to load...)</span>}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {hedgehogFlags.map((hf) => {
              const isEnabled = demoFlags[hf.key];
              return (
                <div key={hf.key} className="bg-card border border-border rounded-xl p-6 flex flex-col items-center text-center">
                  <div className="w-32 h-32 mb-4 rounded-lg overflow-hidden flex items-center justify-center bg-input-bg border border-border">
                    {!flagsReady ? (
                      <div className="flex flex-col items-center gap-2 text-muted">
                        <span className="text-4xl animate-pulse">🦔</span>
                        <span className="text-xs">Loading...</span>
                      </div>
                    ) : isEnabled ? (
                      <HedgehogGif index={hf.gifIndex} size="md" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted">
                        <span className="text-4xl opacity-30">🦔</span>
                        <span className="text-xs">Flag disabled</span>
                      </div>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">{hf.name}</h3>
                  <p className="text-xs text-muted mb-3">{hf.description}</p>
                  <code className="text-xs font-mono text-muted/80 bg-input-bg px-2 py-1 rounded mb-3">{hf.key}</code>
                  <button
                    onClick={() => toggleDemoFlag(hf.key)}
                    className={`w-full py-2.5 font-medium rounded-lg transition-colors text-sm ${
                      isEnabled
                        ? "bg-blue-500/20 hover:bg-blue-500/30 text-blue-400"
                        : "bg-warning/20 hover:bg-warning/30 text-warning"
                    }`}
                  >
                    {isEnabled ? "Deactivate" : "Activate"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Feature Flags ── */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 bg-primary rounded-full" />
            <h2 className="text-lg font-semibold text-foreground">Feature Flags</h2>
          </div>
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-muted text-xs">All feature flags from your PostHog project. Toggle them using client-side overrides.</p>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    const ph = (await import("posthog-js")).default;
                    ph.featureFlags.overrideFeatureFlags(false);
                    reloadFeatureFlags();
                    addLog({ type: "flag", name: "All Flag Overrides Cleared" });
                    showToast("All overrides cleared", "info");
                  }}
                  className="py-2 px-4 bg-error/20 hover:bg-error/30 text-error font-medium rounded-lg transition-colors text-sm"
                >
                  Clear Overrides
                </button>
                <button
                  onClick={() => { reloadFeatureFlags(); showToast("Feature flags reloaded"); }}
                  className="py-2 px-4 bg-primary/20 hover:bg-primary/30 text-primary font-medium rounded-lg transition-colors text-sm"
                >
                  Reload Flags
                </button>
              </div>
            </div>
            {allFlags.length > 0 ? (
              <div className="space-y-2">
                {allFlags.map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between px-4 py-2.5 bg-input-bg border border-border rounded-lg">
                    <code className="text-sm font-mono text-foreground">{key}</code>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        value === true ? "bg-success/20 text-success"
                          : value === false ? "bg-error/20 text-error"
                            : "bg-accent/20 text-accent"
                      }`}>
                        {value === true ? "Enabled" : value === false ? "Disabled" : String(value)}
                      </span>
                      {typeof value === "boolean" ? (
                        <button
                          onClick={() => toggleProjectFlag(key, value)}
                          className={`text-xs font-medium px-3 py-1 rounded-lg transition-colors ${
                            value
                              ? "bg-blue-500/20 hover:bg-blue-500/30 text-blue-400"
                              : "bg-warning/20 hover:bg-warning/30 text-warning"
                          }`}
                        >
                          {value ? "Deactivate" : "Activate"}
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleProjectFlag(key, value)}
                          className="text-xs font-medium px-3 py-1 rounded-lg transition-colors bg-accent/20 hover:bg-accent/30 text-accent"
                        >
                          Switch
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted text-sm text-center py-4">No feature flags loaded. Click &quot;Reload Flags&quot; to fetch them.</p>
            )}
          </div>
        </section>

        {/* ── Flags Applied to Current User ── */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 bg-success rounded-full" />
            <h2 className="text-lg font-semibold text-foreground">Flags Applied to You</h2>
          </div>
          <div className="bg-card border border-success/30 rounded-xl p-6">
            <p className="text-muted text-xs mb-4">Feature flags currently active for your session.</p>
            {activeFlags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {activeFlags.map(([key, value]) => (
                  <span key={key} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-success/10 border border-success/20 text-success rounded-lg text-sm font-mono">
                    <span className="w-1.5 h-1.5 bg-success rounded-full" />
                    {key}
                    {typeof value === "string" && <span className="text-success/60">= {value}</span>}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-muted text-sm text-center py-4">No flags are currently active for your session.</p>
            )}
          </div>
        </section>

        {/* ── Apply Changes ── */}
        <section>
          <div className="bg-card border border-border rounded-xl p-6 text-center">
            <p className="text-muted text-sm mb-4">After toggling flags, reload the page to see changes take effect across the app.</p>
            <button
              onClick={() => window.location.reload()}
              className="py-3 px-8 bg-primary hover:bg-primary-hover text-white font-semibold rounded-lg transition-colors text-sm"
            >
              Reload Page
            </button>
          </div>
        </section>
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
