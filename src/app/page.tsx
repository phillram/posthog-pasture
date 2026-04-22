"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePosthog } from "@/contexts/PosthogContext";
import { HedgehogBanner } from "@/components/HedgehogGif";

export default function SetupPage() {
  const [apiKey, setApiKey] = useState("");
  const [apiHost, setApiHost] = useState("https://us.i.posthog.com");
  const [isValidating, setIsValidating] = useState(false);
  const [keyError, setKeyError] = useState("");
  const { initPosthog, isInitialized, config } = usePosthog();
  const router = useRouter();

  useEffect(() => {
    if (isInitialized && config.apiKey) {
      // Sync form state with context once PostHog is initialized (post-hydration).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setApiKey(config.apiKey);
      setApiHost(config.apiHost);
    }
  }, [isInitialized, config]);

  const settingsUrl = apiHost.includes("eu.")
    ? "https://eu.posthog.com/settings/project-details"
    : "https://us.posthog.com/settings/project-details";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = apiKey.trim();
    const host = apiHost.trim();
    if (!key) return;

    setKeyError("");
    setIsValidating(true);

    try {
      // Validate the API key by hitting the decide endpoint
      const res = await fetch(`${host}/decide?v=3`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: key, distinct_id: "pasture-validation", groups: {} }),
      });

      if (!res.ok) {
        setKeyError(`Could not reach PostHog (HTTP ${res.status}). Check your API key and host.`);
        setIsValidating(false);
        return;
      }

      const data = await res.json();

      // PostHog returns { errored: true } or { status: 0 } for invalid tokens
      if (data.errored === true || data.status === 0) {
        setKeyError("Invalid API key. PostHog rejected this token.");
        setIsValidating(false);
        return;
      }
    } catch {
      // Network error or CORS — validation blocked, proceed anyway.
      // This is common in local dev environments where the /decide endpoint
      // may be blocked by CORS or a firewall. PostHog will report bad keys
      // via the SDK debug logs in the console.
    }

    setIsValidating(false);
    initPosthog(key, host);
    router.push("/login");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary mb-2">🦔 PostHog Pasture</h1>
          <p className="text-muted">Configure your PostHog project to get started</p>
        </div>

        <HedgehogBanner />

        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-5 mt-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">PostHog Project API Key</label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setKeyError("");
              }}
              placeholder="phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className={`w-full px-4 py-3 bg-input-bg border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono text-sm ${keyError ? "border-error" : "border-border"}`}
            />
            <p className="text-xs text-muted mt-2">Find this in PostHog → Project Settings → Project API Key</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">API Host</label>
            <select
              value={apiHost}
              onChange={(e) => {
                setApiHost(e.target.value);
                setKeyError("");
              }}
              className="w-full px-4 py-3 bg-input-bg border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
            >
              <option value="https://us.i.posthog.com">US Cloud (us.i.posthog.com)</option>
              <option value="https://eu.i.posthog.com">EU Cloud (eu.i.posthog.com)</option>
            </select>
          </div>

          {keyError && (
            <div className="bg-error/10 border border-error/30 rounded-lg p-4 space-y-2">
              <p className="text-error text-sm font-medium">{keyError}</p>
              <p className="text-error/80 text-xs">
                Find your correct Project API Key at:{" "}
                <a
                  href={settingsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium hover:text-error transition-colors"
                >
                  {settingsUrl}
                </a>
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={isValidating}
            className="w-full py-3 bg-primary hover:bg-primary-hover text-white font-semibold rounded-lg transition-colors animate-pulse-glow disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isValidating ? "Validating..." : "Connect & Continue"}
          </button>

          {isInitialized && !keyError && (
            <div className="flex items-center gap-2 text-success text-sm">
              <span className="w-2 h-2 bg-success rounded-full" />
              PostHog is connected
            </div>
          )}
        </form>

        <p className="text-center text-xs text-muted mt-6">
          Your API key is stored locally in your browser and never sent to any server other than PostHog.
        </p>
      </div>
    </div>
  );
}
