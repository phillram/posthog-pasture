"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { usePosthog } from "@/contexts/PosthogContext";
import Navbar from "@/components/Navbar";
import ToastStack from "@/components/ToastStack";
import { useToast } from "@/hooks/useToast";

export default function ErrorsPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const { isInitialized, captureException } = usePosthog();
  const router = useRouter();

  const [exceptionMessage, setExceptionMessage] = useState("Cannot read properties of undefined (reading 'map')");
  const [exceptionType, setExceptionType] = useState("TypeError");
  const [exceptionSource, setExceptionSource] = useState("components/UserList.tsx");
  const [exceptionLineNo, setExceptionLineNo] = useState("42");
  const [throwReal, setThrowReal] = useState(false);

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
                className="py-2 px-4 bg-error/20 hover:bg-error/30 text-error font-medium rounded-lg transition-colors text-sm"
              >
                Quick Trigger Error
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                value={exceptionMessage}
                onChange={(e) => setExceptionMessage(e.target.value)}
                placeholder="Error message"
                className="w-full px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-error text-sm font-mono"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted mb-1 block">Type</label>
                  <select
                    value={exceptionType}
                    onChange={(e) => setExceptionType(e.target.value)}
                    className="w-full px-3 py-2.5 bg-input-bg border border-border rounded-lg text-foreground text-sm"
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
                    className="w-full px-3 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-error text-sm font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">Source file</label>
                <input
                  type="text"
                  value={exceptionSource}
                  onChange={(e) => setExceptionSource(e.target.value)}
                  placeholder="components/UserList.tsx"
                  className="w-full px-3 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-error text-sm font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
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
                className="w-full py-2.5 bg-error/80 hover:bg-error text-white font-medium rounded-lg transition-colors text-sm"
              >
                Capture Exception
              </button>
            </div>
          </div>
        </section>
      </main>

      <ToastStack toasts={toasts} />
    </div>
  );
}
