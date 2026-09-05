"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { usePosthog } from "@/contexts/PosthogContext";
import Navbar from "@/components/Navbar";
import HedgehogGif from "@/components/HedgehogGif";
import ToastStack from "@/components/ToastStack";
import { useToast } from "@/hooks/useToast";

const QUICK_FIRE_ERRORS = [
  { type: "TypeError", message: "Cannot read properties of null (reading 'id')", source: "lib/user.ts", lineno: 88 },
  { type: "ReferenceError", message: "fetchUser is not defined", source: "pages/profile.tsx", lineno: 14 },
  { type: "RangeError", message: "Maximum call stack size exceeded", source: "utils/recurse.ts", lineno: 7 },
  { type: "NetworkError", message: "Failed to fetch: 503 Service Unavailable", source: "api/client.ts", lineno: 132 },
  { type: "SyntaxError", message: "Unexpected token '}' in JSON at position 47", source: "utils/parseConfig.ts", lineno: 23 },
];

export default function ErrorsPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const { isInitialized, captureException } = usePosthog();
  const router = useRouter();

  const [exceptionMessage, setExceptionMessage] = useState("Cannot read properties of undefined (reading 'spikes')");
  const [exceptionType, setExceptionType] = useState("TypeError");
  const [exceptionSource, setExceptionSource] = useState("components/HedgehogBurrow.tsx");
  const [exceptionLineNo, setExceptionLineNo] = useState("42");
  const [throwReal, setThrowReal] = useState(false);

  const [quickFireCount, setQuickFireCount] = useState(1);
  const [quickFireSelection, setQuickFireSelection] = useState("random");

  const { toasts, showToast } = useToast();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) return null;

  const triggerError = () => {
    try {
      throw new Error("Test error from PostHog Pasture");
    } catch (e) {
      captureException({
        message: (e as Error).message,
        type: "Error",
        source: "PostHog Pasture Errors",
        stackTrace: (e as Error).stack,
      });
      showToast("Error exception sent", "error");
    }
  };

  const handleCustomException = () => {
    if (!exceptionMessage.trim()) return;
    if (throwReal) {
      try {
        throw new Error(exceptionMessage);
      } catch (e) {
        captureException({
          message: (e as Error).message,
          type: exceptionType || "Error",
          source: exceptionSource || "unknown",
          lineno: exceptionLineNo ? parseInt(exceptionLineNo) : undefined,
          stackTrace: (e as Error).stack,
        });
      }
    } else {
      captureException({
        message: exceptionMessage,
        type: exceptionType || "Error",
        source: exceptionSource || "unknown",
        lineno: exceptionLineNo ? parseInt(exceptionLineNo) : undefined,
      });
    }
    showToast(`Exception "${exceptionType}: ${exceptionMessage.slice(0, 40)}" sent`, "error");
  };

  const handleQuickFire = () => {
    if (!isInitialized) return;
    const n = Math.max(1, Math.min(20, quickFireCount || 1));
    let lastType = "";
    for (let i = 0; i < n; i++) {
      const err =
        quickFireSelection === "random"
          ? QUICK_FIRE_ERRORS[Math.floor(Math.random() * QUICK_FIRE_ERRORS.length)]
          : QUICK_FIRE_ERRORS[parseInt(quickFireSelection)];
      lastType = err.type;
      captureException({
        message: err.message,
        type: err.type,
        source: err.source,
        lineno: err.lineno,
      });
    }
    const label = quickFireSelection === "random" ? "random" : lastType;
    showToast(`Fired ${n} ${label} exception${n === 1 ? "" : "s"}`, "error");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Error Tracking</h1>
            <p className="text-muted text-sm">
              Fire synthetic exceptions to test PostHog&apos;s error tracking pipeline.
            </p>
          </div>
          <HedgehogGif index={2} size="sm" />
        </div>

        {!isInitialized && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 text-warning text-sm">
            PostHog is not connected. Events will not be sent.{" "}
            <button onClick={() => router.push("/")} className="underline font-medium">
              Set up your API key
            </button>
          </div>
        )}

        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 bg-error rounded-full" />
            <h2 className="text-lg font-semibold text-foreground">Custom Exception</h2>
          </div>
          <div className="bg-card border border-error/30 rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">Build a $exception event</h3>
                <p className="text-muted text-xs mt-1">
                  Create a custom $exception event with full control over error details.
                </p>
              </div>
              <button
                onClick={triggerError}
                className="py-2.5 px-4 bg-error/20 hover:bg-error/30 text-error font-medium rounded-lg transition-colors text-sm"
              >
                Quick Trigger Error
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                value={exceptionMessage}
                onChange={(e) => setExceptionMessage(e.target.value)}
                placeholder="Cannot read properties of undefined (reading 'spikes')"
                className="w-full px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-error text-sm font-mono"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted mb-1 block">Type</label>
                  <select
                    value={exceptionType}
                    onChange={(e) => setExceptionType(e.target.value)}
                    className="w-full px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground text-sm"
                  >
                    <option value="TypeError">TypeError</option>
                    <option value="ReferenceError">ReferenceError</option>
                    <option value="SyntaxError">SyntaxError</option>
                    <option value="RangeError">RangeError</option>
                    <option value="URIError">URIError</option>
                    <option value="EvalError">EvalError</option>
                    <option value="Error">Error</option>
                    <option value="NetworkError">NetworkError</option>
                    <option value="TimeoutError">TimeoutError</option>
                    <option value="AbortError">AbortError</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">Line No</label>
                  <input
                    type="text"
                    value={exceptionLineNo}
                    onChange={(e) => setExceptionLineNo(e.target.value)}
                    placeholder="42"
                    className="w-full px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-error text-sm font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">Source file</label>
                <input
                  type="text"
                  value={exceptionSource}
                  onChange={(e) => setExceptionSource(e.target.value)}
                  placeholder="components/HedgehogBurrow.tsx"
                  className="w-full px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-error text-sm font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={throwReal}
                  aria-label="Throw real JS error"
                  onClick={() => {
                    setThrowReal(!throwReal);
                    showToast(throwReal ? "Real throw disabled" : "Real throw enabled", "info");
                  }}
                  className={`relative w-10 h-5 rounded-full transition-colors ${throwReal ? "bg-error" : "bg-muted/30"}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${throwReal ? "translate-x-5" : "translate-x-0"}`}
                  />
                </button>
                <span className="text-xs text-muted">Throw real JS error (includes stack trace)</span>
              </div>
              <button
                onClick={handleCustomException}
                className="w-full py-2.5 px-4 bg-error hover:bg-error-hover text-white font-medium rounded-lg transition-colors text-sm"
              >
                Capture Exception
              </button>
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 bg-error rounded-full" />
            <h2 className="text-lg font-semibold text-foreground">Quick Fire Errors</h2>
          </div>
          <div className="bg-card border border-error/30 rounded-xl p-6">
            <div className="mb-3">
              <h3 className="text-base font-semibold text-foreground">Fire a batch of varied exceptions</h3>
              <p className="text-muted text-xs mt-1">
                Pick a count and an error (or Random for a mix) to fire multiple exceptions in one click.
              </p>
            </div>
            <div className="grid grid-cols-[80px_1fr_auto] gap-2 items-end">
              <div>
                <label className="text-xs text-muted mb-1 block">Count</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={quickFireCount}
                  onChange={(e) => setQuickFireCount(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-error text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">Error</label>
                <select
                  value={quickFireSelection}
                  onChange={(e) => setQuickFireSelection(e.target.value)}
                  className="w-full px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground text-sm"
                >
                  <option value="random">Random</option>
                  {QUICK_FIRE_ERRORS.map((err, i) => (
                    <option key={i} value={String(i)}>
                      {err.type} — {err.message.length > 50 ? err.message.slice(0, 50) + "…" : err.message}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleQuickFire}
                className="py-2.5 px-4 bg-error hover:bg-error-hover text-white font-medium rounded-lg transition-colors text-sm"
              >
                Fire
              </button>
            </div>
          </div>
        </section>
      </main>

      <ToastStack toasts={toasts} />
    </div>
  );
}
