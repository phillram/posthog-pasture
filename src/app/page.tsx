"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePosthog } from "@/contexts/PosthogContext";
import { HedgehogBanner } from "@/components/HedgehogGif";

export default function SetupPage() {
  const [apiKey, setApiKey] = useState("");
  const [apiHost, setApiHost] = useState("https://us.i.posthog.com");
  const { initPosthog, isInitialized, config } = usePosthog();
  const router = useRouter();

  useEffect(() => {
    if (isInitialized && config.apiKey) {
      setApiKey(config.apiKey);
      setApiHost(config.apiHost);
    }
  }, [isInitialized, config]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    initPosthog(apiKey.trim(), apiHost.trim());
    router.push("/login");
  };


  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary mb-2">🦔 PostHog Playground</h1>
          <p className="text-muted">
            Configure your PostHog project to get started
          </p>
        </div>

        <HedgehogBanner />

        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-5 mt-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              PostHog Project API Key
            </label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full px-4 py-3 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono text-sm"
            />
            <p className="text-xs text-muted mt-2">
              Find this in PostHog → Project Settings → Project API Key
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              API Host
            </label>
            <select
              value={apiHost}
              onChange={(e) => setApiHost(e.target.value)}
              className="w-full px-4 py-3 bg-input-bg border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
            >
              <option value="https://us.i.posthog.com">US Cloud (us.i.posthog.com)</option>
              <option value="https://eu.i.posthog.com">EU Cloud (eu.i.posthog.com)</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-primary hover:bg-primary-hover text-white font-semibold rounded-lg transition-colors animate-pulse-glow"
          >
            Connect & Continue
          </button>

          {isInitialized && (
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
