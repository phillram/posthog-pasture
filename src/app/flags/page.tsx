"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { usePosthog } from "@/contexts/PosthogContext";
import Navbar from "@/components/Navbar";
import HedgehogGif from "@/components/HedgehogGif";
import ToastStack from "@/components/ToastStack";
import { useToast } from "@/hooks/useToast";

// ── Flag definitions ──
// hog-spin:   Boolean flag. true = show spinning hedgehog, false = disabled.
// hog-dance:  Multivariate flag. Values: "sonic", "cgi", "triple".
// hog-action: Multivariate flag. Values: "run", "sleep", "swim".

// GIF URLs for each flag variant
const GIFS = {
  spin: "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExcnFhd2Y2NjlyazY0dHduNWphZHMxN3A0bnA5b3l3Mjhha2Q2c2Q1bSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/oNGwPFSB1GPwebIFnb/giphy.gif",
  dance: {
    sonic:
      "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExb3lqaDZlb3U1aGlwaDh1dThvY2V4bG1jNDlnemRtdzljNDl2MDQwNyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/ng2FnI4Mg33bOqGaFO/giphy.gif",
    cgi: "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExaDV4YnI0bXNtM2EzNGNkYTRueGYzdzg1ajMwbzlqMWQxYW9kcThlZCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/EWIiv7izSd4J51tntS/giphy.gif",
    triple:
      "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExaHV4Y3BpemFhdGhzOGd5NjlvdGd2NWJyNDU4aDhycXN1bGU1ZGZzbiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/26u47KZgV82BHdXgc/giphy.gif",
  },
  action: {
    run: "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExNm40bjEyMHpqYmc1ZGhyd3h2ZDVzNWRrdHYzd3llYXNzeWlmYW43cyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3ohrysN9ge0eqKphCM/giphy.gif",
    sleep:
      "https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExZXR1OXhsczFyc3JpOGRtYWkxNWd1b2VqM3FldXc0eWJmZGZ0MHc2YiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/mZtd62JFmSz4z7eU1W/giphy.gif",
    swim: "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExeHJ4NDk4b3QyaHJwamp5dHMzNmlmZTRqdHNqbzZ2czF6d21lMGhwciZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/yzvVXSvrg7JxC/giphy.gif",
  },
};

const FLAG_KEYS = ["hog-spin", "hog-dance", "hog-action"] as const;

export default function FlagsPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const { featureFlags, flagsReady, reloadFeatureFlags, addLog, isInitialized, config } = usePosthog();
  const router = useRouter();

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

  // ── Override helpers ──

  const overrideFlag = async (key: string, value: boolean | string) => {
    const ph = (await import("posthog-js")).default;
    ph.featureFlags.overrideFeatureFlags({ flags: { [key]: value } });
    reloadFeatureFlags();
    addLog({ type: "flag", name: `Flag Override: ${key}`, properties: { flag: key, value } });
    showToast(`"${key}" set to ${String(value)}`);
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
    addLog({
      type: "flag",
      name: `Flag ${typeof next === "boolean" ? (next ? "Activated" : "Deactivated") : "Switched"}: ${key}`,
      properties: { flag: key, from: currentValue, to: next },
    });
    reloadFeatureFlags();
    showToast(`"${key}" ${typeof next === "boolean" ? (next ? "activated" : "deactivated") : `switched to "${next}"`}`);
  };

  // ── Derived data ──

  const activeFlags = Object.entries(featureFlags)
    .filter(([, value]) => value === true || (typeof value === "string" && value !== "false"))
    .sort(([a], [b]) => a.localeCompare(b));

  const allFlags = Object.entries(featureFlags).sort(([a], [b]) => a.localeCompare(b));

  // ── Render helpers for each flag card ──

  // Derive hedgehog flag values directly from context state
  const hogSpin = featureFlags["hog-spin"];
  const hogDance = featureFlags["hog-dance"];
  const hogAction = featureFlags["hog-action"];

  function renderGifOrPlaceholder(gifUrl: string | null) {
    if (isInitialized && !flagsReady) {
      return (
        <div className="flex flex-col items-center gap-2 text-muted">
          <span className="text-4xl animate-pulse">🦔</span>
          <span className="text-xs">Loading...</span>
        </div>
      );
    }
    if (gifUrl) {
      return <img src={gifUrl} alt="Hedgehog" className="w-32 h-32 rounded-lg object-cover" />;
    }
    return (
      <div className="flex flex-col items-center gap-2 text-muted">
        <span className="text-4xl opacity-30">🦔</span>
        <span className="text-xs">Flag disabled</span>
      </div>
    );
  }

  // Determine which GIF to show for each flag
  let spinGif: string | null = null;
  if (hogSpin === true) spinGif = GIFS.spin;

  let danceGif: string | null = null;
  if (hogDance === "sonic") danceGif = GIFS.dance.sonic;
  if (hogDance === "cgi") danceGif = GIFS.dance.cgi;
  if (hogDance === "triple") danceGif = GIFS.dance.triple;

  let actionGif: string | null = null;
  if (hogAction === "run") actionGif = GIFS.action.run;
  if (hogAction === "sleep") actionGif = GIFS.action.sleep;
  if (hogAction === "swim") actionGif = GIFS.action.swim;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Flags</h1>
            <p className="text-muted text-sm">Toggle feature flags and watch hedgehogs react.</p>
          </div>
          <HedgehogGif index={4} size="sm" />
        </div>

        {/* ── Hedgehog Feature Flags ── */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 bg-warning rounded-full" />
            <h2 className="text-lg font-semibold text-foreground">Hedgehog Feature Flags</h2>
          </div>
          <p className="text-muted text-sm mb-4">
            Each flag controls a different hedgehog. Toggle values to see who appears!
            {!flagsReady && <span className="ml-2 text-warning text-xs">(Waiting for flags to load...)</span>}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* ── hog-spin (Boolean) ── */}
            <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center text-center">
              <div className="w-32 h-32 mb-4 rounded-lg overflow-hidden flex items-center justify-center bg-input-bg border border-border">
                {renderGifOrPlaceholder(spinGif)}
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">Hog Spin</h3>
              <p className="text-xs text-muted mb-2">Boolean flag. Enable to see a spinning hedgehog.</p>
              <code className="text-xs font-mono text-muted/80 bg-input-bg px-2 py-1 rounded mb-3">hog-spin</code>
              <p className="text-xs text-muted mb-2">
                Current: <span className="font-semibold text-foreground">{hogSpin === true ? "true" : "false"}</span>
              </p>
              <button
                onClick={() => overrideFlag("hog-spin", hogSpin !== true)}
                className={`w-full py-2.5 font-medium rounded-lg transition-colors text-sm ${
                  hogSpin === true
                    ? "bg-blue-500/20 hover:bg-blue-500/30 text-blue-400"
                    : "bg-warning/20 hover:bg-warning/30 text-warning"
                }`}
              >
                {hogSpin === true ? "Deactivate" : "Activate"}
              </button>
            </div>

            {/* ── hog-dance (Multivariate: sonic, cgi, triple) ── */}
            <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center text-center">
              <div className="w-32 h-32 mb-4 rounded-lg overflow-hidden flex items-center justify-center bg-input-bg border border-border">
                {renderGifOrPlaceholder(danceGif)}
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">Hog Dance</h3>
              <p className="text-xs text-muted mb-2">Multivariate flag. Pick a dance style for the hedgehog.</p>
              <code className="text-xs font-mono text-muted/80 bg-input-bg px-2 py-1 rounded mb-3">hog-dance</code>
              <p className="text-xs text-muted mb-2">
                Current: <span className="font-semibold text-foreground">{hogDance || "off"}</span>
              </p>
              <div className="grid grid-cols-3 gap-1.5 w-full mb-2">
                <button
                  onClick={() => overrideFlag("hog-dance", "sonic")}
                  className={`py-2 text-xs font-medium rounded-lg transition-colors ${hogDance === "sonic" ? "bg-warning text-black" : "bg-warning/20 hover:bg-warning/30 text-warning"}`}
                >
                  Sonic
                </button>
                <button
                  onClick={() => overrideFlag("hog-dance", "cgi")}
                  className={`py-2 text-xs font-medium rounded-lg transition-colors ${hogDance === "cgi" ? "bg-warning text-black" : "bg-warning/20 hover:bg-warning/30 text-warning"}`}
                >
                  CGI
                </button>
                <button
                  onClick={() => overrideFlag("hog-dance", "triple")}
                  className={`py-2 text-xs font-medium rounded-lg transition-colors ${hogDance === "triple" ? "bg-warning text-black" : "bg-warning/20 hover:bg-warning/30 text-warning"}`}
                >
                  Triple
                </button>
              </div>
              <button
                onClick={() => overrideFlag("hog-dance", false)}
                className="w-full py-2 text-xs font-medium rounded-lg transition-colors bg-blue-500/20 hover:bg-blue-500/30 text-blue-400"
              >
                Disable
              </button>
            </div>

            {/* ── hog-action (Multivariate: run, sleep, swim) ── */}
            <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center text-center">
              <div className="w-32 h-32 mb-4 rounded-lg overflow-hidden flex items-center justify-center bg-input-bg border border-border">
                {renderGifOrPlaceholder(actionGif)}
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">Hog Action</h3>
              <p className="text-xs text-muted mb-2">Multivariate flag. Choose what the hedgehog does.</p>
              <code className="text-xs font-mono text-muted/80 bg-input-bg px-2 py-1 rounded mb-3">hog-action</code>
              <p className="text-xs text-muted mb-2">
                Current: <span className="font-semibold text-foreground">{hogAction || "off"}</span>
              </p>
              <div className="grid grid-cols-3 gap-1.5 w-full mb-2">
                <button
                  onClick={() => overrideFlag("hog-action", "run")}
                  className={`py-2 text-xs font-medium rounded-lg transition-colors ${hogAction === "run" ? "bg-warning text-black" : "bg-warning/20 hover:bg-warning/30 text-warning"}`}
                >
                  Run
                </button>
                <button
                  onClick={() => overrideFlag("hog-action", "sleep")}
                  className={`py-2 text-xs font-medium rounded-lg transition-colors ${hogAction === "sleep" ? "bg-warning text-black" : "bg-warning/20 hover:bg-warning/30 text-warning"}`}
                >
                  Sleep
                </button>
                <button
                  onClick={() => overrideFlag("hog-action", "swim")}
                  className={`py-2 text-xs font-medium rounded-lg transition-colors ${hogAction === "swim" ? "bg-warning text-black" : "bg-warning/20 hover:bg-warning/30 text-warning"}`}
                >
                  Swim
                </button>
              </div>
              <button
                onClick={() => overrideFlag("hog-action", false)}
                className="w-full py-2 text-xs font-medium rounded-lg transition-colors bg-blue-500/20 hover:bg-blue-500/30 text-blue-400"
              >
                Disable
              </button>
            </div>
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
                  <span
                    key={key}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-success/10 border border-success/20 text-success rounded-lg text-sm font-mono"
                  >
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

        {/* ── All Feature Flags on Project ── */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 bg-primary rounded-full" />
            <h2 className="text-lg font-semibold text-foreground">All Feature Flags on Project</h2>
          </div>
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-muted text-xs">
                All feature flags from your PostHog project. Toggle them using client-side overrides.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    window.location.reload();
                  }}
                  className="py-2 px-4 bg-muted/20 hover:bg-muted/30 text-muted font-medium rounded-lg transition-colors text-sm"
                >
                  Reload Page
                </button>
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
                  onClick={() => {
                    reloadFeatureFlags();
                    showToast("Feature flags reloaded");
                  }}
                  className="py-2 px-4 bg-primary/20 hover:bg-primary/30 text-primary font-medium rounded-lg transition-colors text-sm"
                >
                  Reload Flags
                </button>
              </div>
            </div>
            {allFlags.length > 0 ? (
              <div className="space-y-2">
                {allFlags.map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between px-4 py-2.5 bg-input-bg border border-border rounded-lg"
                  >
                    <code className="text-sm font-mono text-foreground">{key}</code>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                          value === true
                            ? "bg-success/20 text-success"
                            : value === false
                              ? "bg-error/20 text-error"
                              : "bg-accent/20 text-accent"
                        }`}
                      >
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
              <p className="text-muted text-sm text-center py-4">
                No feature flags loaded. Click &quot;Reload Flags&quot; to fetch them.
              </p>
            )}
          </div>
        </section>
      </main>

      <ToastStack toasts={toasts} />
    </div>
  );
}
