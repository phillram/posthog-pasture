"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { usePosthog } from "@/contexts/PosthogContext";
import Navbar from "@/components/Navbar";
import HedgehogGif from "@/components/HedgehogGif";
import ApiHostField, { US_CLOUD_HOST } from "@/components/ApiHostField";

export default function ConfigPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const {
    config,
    isInitialized,
    updateConfig,
    resetConfig,
    initPosthog,
    resetPerson,
    optIn,
    optOut,
    isOptedOut,
    consentStatus,
    exceptionAutocapture,
    setExceptionAutocapture,
  } = usePosthog();
  const router = useRouter();

  const [apiKey, setApiKey] = useState(config.apiKey);
  const [apiHost, setApiHost] = useState(config.apiHost);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // The context loads the saved config after mount, so the form fields have to
  // follow it once it arrives.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApiKey(config.apiKey);
    setApiHost(config.apiHost);
  }, [config]);

  if (isLoading || !isAuthenticated) return null;

  const connectionChanged = apiKey.trim() !== config.apiKey || apiHost.trim() !== config.apiHost;

  const handleSaveConnection = () => {
    if (apiKey.trim()) {
      initPosthog(apiKey.trim(), apiHost.trim());
    }
  };

  const handleFullReset = () => {
    resetConfig();
    setApiKey("");
    setApiHost(US_CLOUD_HOST);
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">PostHog Configuration</h1>
            <p className="text-muted text-sm">Manage your PostHog connection and settings</p>
          </div>
          <HedgehogGif index={3} size="sm" />
        </div>

        {/* Connection Settings */}
        <section className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Connection</h2>
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-3 h-3 rounded-full ${isInitialized ? "bg-success animate-pulse" : "bg-error"}`} />
            <span className="text-sm text-foreground">{isInitialized ? "Connected" : "Not Connected"}</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Project API Key</label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary text-sm font-mono"
            />
          </div>

          <ApiHostField value={apiHost} onChange={setApiHost} />

          {connectionChanged && (
            <p className="text-warning text-xs">
              The SDK cannot switch projects in place, so Pasture reloads the page to connect to this one. Your event
              log survives the reload.
            </p>
          )}

          <button
            onClick={handleSaveConnection}
            disabled={!apiKey.trim()}
            className="w-full py-3 bg-primary hover:bg-primary-hover text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {connectionChanged ? "Save & reconnect" : "Connected"}
          </button>
        </section>

        {/* Capture Settings */}
        <section className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Capture Settings</h2>
          <p className="text-muted text-xs">Each change reaches the SDK right away. No reconnect, no page reload.</p>

          {[
            {
              label: "Autocapture",
              key: "autocapture" as const,
              desc: "Automatically capture clicks, inputs, and form submissions",
            },
            {
              label: "Capture Pageview",
              key: "capturePageview" as const,
              desc: "Automatically capture $pageview events on page load",
            },
            {
              label: "Capture Pageleave",
              key: "capturePageleave" as const,
              desc: "Automatically capture $pageleave events",
            },
          ].map(({ label, key, desc }) => (
            <div key={key} className="flex items-center justify-between py-2 border-b border-border/50">
              <div>
                <span className="text-sm font-medium text-foreground">{label}</span>
                <p className="text-xs text-muted">{desc}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={config[key]}
                aria-label={label}
                onClick={() => updateConfig({ [key]: !config[key] })}
                className={`relative w-10 h-5 rounded-full transition-colors ${config[key] ? "bg-success" : "bg-muted/30"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${config[key] ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
            </div>
          ))}

          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <div>
              <span className="text-sm font-medium text-foreground">Capture Exceptions</span>
              <p className="text-xs text-muted">Automatically capture uncaught errors and unhandled rejections</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={exceptionAutocapture}
              aria-label="Capture exceptions"
              onClick={() => setExceptionAutocapture(!exceptionAutocapture)}
              className={`relative w-10 h-5 rounded-full transition-colors ${exceptionAutocapture ? "bg-success" : "bg-muted/30"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${exceptionAutocapture ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <div>
              <span className="text-sm font-medium text-foreground">Disable Session Recording</span>
              <p className="text-xs text-muted">Prevent session recording from starting</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={config.disableSessionRecording}
              aria-label="Disable session recording"
              onClick={() => updateConfig({ disableSessionRecording: !config.disableSessionRecording })}
              className={`relative w-10 h-5 rounded-full transition-colors ${config.disableSessionRecording ? "bg-error" : "bg-muted/30"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${config.disableSessionRecording ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
          </div>
        </section>

        {/* Opt In/Out */}
        <section className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Privacy & Consent</h2>
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-3 h-3 rounded-full ${isOptedOut ? "bg-error" : "bg-success"}`} />
            <span className="text-sm text-foreground">
              {isOptedOut ? "Opted Out — events are NOT being captured" : "Opted In — events are being captured"}
            </span>
          </div>
          <p className="text-xs text-muted">
            PostHog records consent separately from the opt-out flag. It reads{" "}
            <span className="font-mono text-foreground">{consentStatus}</span> right now — &quot;pending&quot; until
            someone chooses.
          </p>
          <div className="flex gap-3">
            <button
              onClick={optIn}
              className="flex-1 py-2.5 px-4 bg-success/20 hover:bg-success/30 text-success font-medium rounded-lg transition-colors text-sm"
            >
              Opt In
            </button>
            <button
              onClick={optOut}
              className="flex-1 py-2.5 px-4 bg-error/20 hover:bg-error/30 text-error font-medium rounded-lg transition-colors text-sm"
            >
              Opt Out
            </button>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="bg-card border border-error/30 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-error">Danger Zone</h2>

          <div className="flex items-center justify-between py-3 border-b border-border/50">
            <div>
              <span className="text-sm font-medium text-foreground">Reset Person Data</span>
              <p className="text-xs text-muted">Generate a new anonymous distinct_id and clear person properties</p>
            </div>
            <button
              onClick={resetPerson}
              className="py-2.5 px-4 bg-error/20 hover:bg-error/30 text-error font-medium rounded-lg transition-colors text-sm"
            >
              Reset Person
            </button>
          </div>

          <div className="flex items-center justify-between py-3">
            <div>
              <span className="text-sm font-medium text-foreground">Full Reset</span>
              <p className="text-xs text-muted">Disconnect PostHog, clear API key and all settings</p>
            </div>
            <button
              onClick={handleFullReset}
              className="py-2.5 px-4 bg-error hover:bg-error-hover text-white font-medium rounded-lg transition-colors text-sm"
            >
              Reset Everything
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
