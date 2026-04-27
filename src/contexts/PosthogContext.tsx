"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import posthog from "posthog-js";

interface PosthogConfig {
  apiKey: string;
  apiHost: string;
  autocapture: boolean;
  capturePageview: boolean;
  capturePageleave: boolean;
  disableSessionRecording: boolean;
}

interface PosthogContextType {
  config: PosthogConfig;
  isInitialized: boolean;
  eventLog: EventLogEntry[];
  localPersonProperties: Record<string, unknown>;
  initPosthog: (apiKey: string, apiHost?: string) => void;
  updateConfig: (updates: Partial<PosthogConfig>) => void;
  resetConfig: () => void;
  captureEvent: (eventName: string, properties?: Record<string, unknown>) => void;
  captureException: (opts: {
    message: string;
    type?: string;
    source?: string;
    lineno?: number;
    stackTrace?: string;
  }) => void;
  identifyUser: (userId: string, properties?: Record<string, unknown>) => void;
  resetPerson: () => void;
  setPersonProperties: (properties: Record<string, unknown>) => void;
  groupIdentify: (groupType: string, groupKey: string, properties?: Record<string, unknown>) => void;
  capturePageview: (url?: string) => void;
  registerSuperProperties: (properties: Record<string, unknown>) => void;
  unregisterSuperProperty: (key: string) => void;
  optIn: () => void;
  optOut: () => void;
  isOptedOut: boolean;
  featureFlags: Record<string, boolean | string>;
  flagsReady: boolean;
  reloadFeatureFlags: () => void;
  reloadFeatureFlagsAndCapture: () => void;
  startSessionRecording: () => void;
  stopSessionRecording: () => void;
  isRecording: boolean;
  addLog: (entry: { type: EventLogEntry["type"]; name: string; properties?: Record<string, unknown> }) => void;
  lastRequestError: { status: number; message: string; at: number } | null;
  clearRequestError: () => void;
}

interface EventLogEntry {
  id: string;
  timestamp: Date;
  type: "event" | "identify" | "pageview" | "group" | "error" | "config" | "person" | "flag" | "recording";
  name: string;
  properties?: Record<string, unknown>;
}

const defaultConfig: PosthogConfig = {
  apiKey: "",
  apiHost: "https://us.i.posthog.com",
  autocapture: true,
  capturePageview: true,
  capturePageleave: true,
  disableSessionRecording: false,
};

const PosthogContext = createContext<PosthogContextType | null>(null);

export function PosthogProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<PosthogConfig>(defaultConfig);
  const [isInitialized, setIsInitialized] = useState(false);
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [localPersonProperties, setLocalPersonProperties] = useState<Record<string, unknown>>({});
  const [isOptedOut, setIsOptedOut] = useState(false);
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean | string>>({});
  const [flagsReady, setFlagsReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [lastRequestError, setLastRequestError] = useState<{
    status: number;
    message: string;
    at: number;
  } | null>(null);
  const initRef = useRef(false);
  // When true, the next onFeatureFlags callback will fire $feature_flag_called for each flag
  const fireFlagEventsRef = useRef(false);

  const MAX_LOG_ENTRIES = 100;

  const addLog = useCallback((entry: Omit<EventLogEntry, "id" | "timestamp">) => {
    setEventLog((prev) => [
      { ...entry, id: crypto.randomUUID(), timestamp: new Date() },
      ...prev.slice(0, MAX_LOG_ENTRIES - 1),
    ]);
  }, []);

  const addLogRef = useRef(addLog);
  useEffect(() => {
    addLogRef.current = addLog;
  }, [addLog]);

  // Shared init routine used by both the mount-time rehydration effect and
  // interactive calls to initPosthog. Keeping a single source of truth avoids
  // drift between the two call sites.
  const runPosthogInit = useCallback((cfg: PosthogConfig) => {
    posthog.init(cfg.apiKey, {
      api_host: cfg.apiHost || "https://us.i.posthog.com",
      autocapture: cfg.autocapture,
      capture_pageview: cfg.capturePageview,
      capture_pageleave: cfg.capturePageleave,
      debug: true,
      disable_session_recording: cfg.disableSessionRecording,
      // Always create a person profile so setPersonProperties propagates even
      // before identify() — otherwise the default 'identified_only' silently
      // drops $set events on anonymous sessions.
      person_profiles: "always",
      // This is a sandbox — flush events as fast as the SDK allows (minimum 250ms)
      // so captures show up in PostHog's UI with minimal delay. Default is 3s.
      request_queue_config: { flush_interval_ms: 250 },
      // Surface PostHog network failures in the event log + as an error toast
      // (see PosthogProvider useEffect below). This only fires on real errors
      // so it won't spam the log with every capture.
      on_request_error: (err) => {
        const status = typeof err === "object" && err && "statusCode" in err ? Number(err.statusCode) : 0;
        const message =
          typeof err === "object" && err && "text" in err && err.text
            ? String(err.text)
            : typeof err === "object" && err && "error" in err
              ? String(err.error)
              : "Unknown error";
        addLogRef.current({
          type: "error",
          name: `PostHog request failed${status ? ` (${status})` : ""}`,
          properties: { status, message },
        });
        setLastRequestError({ status, message, at: Date.now() });
      },
      loaded: (ph) => {
        ph.onFeatureFlags(() => {
          const flags = ph.featureFlags.getFlagVariants();
          // Only fire $feature_flag_called events when explicitly requested
          // (e.g. when the user logs in with "Apply feature flags" enabled)
          if (fireFlagEventsRef.current) {
            Object.entries(flags).forEach(([key, value]) =>
              ph.capture("$feature_flag_called", {
                $feature_flag: key,
                $feature_flag_response: value,
              })
            );
            fireFlagEventsRef.current = false;
          }
          setFeatureFlags(flags as Record<string, boolean | string>);
          setFlagsReady(true);
          addLogRef.current({
            type: "flag",
            name: "Feature Flags Ready",
            properties: flags as Record<string, unknown>,
          });
        });
      },
    });
    initRef.current = true;
    if (typeof window !== "undefined") {
      (window as unknown as Record<string, unknown>).posthog = posthog;
    }
  }, []);

  // Load locally-tracked person properties on mount. These are tracked by us
  // (not posthog-js) so we can echo them back in the UI — posthog.setPersonProperties
  // sends $set events but does not persist the values where the client can read them.
  useEffect(() => {
    const saved = localStorage.getItem("posthog_pasture_person_props");
    if (!saved) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalPersonProperties(JSON.parse(saved));
    } catch {
      localStorage.removeItem("posthog_pasture_person_props");
    }
  }, []);

  // Load config from localStorage on mount. This is a client-only read, so it
  // must happen in an effect to stay SSR-safe. The react-hooks/set-state-in-effect
  // rule flags this pattern but it's correct here.
  useEffect(() => {
    const saved = localStorage.getItem("posthog_config");
    if (!saved) return;
    let parsed: PosthogConfig;
    try {
      parsed = { ...defaultConfig, ...JSON.parse(saved) };
    } catch (err) {
      console.warn("Corrupt posthog_config in localStorage, clearing:", err);
      localStorage.removeItem("posthog_config");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfig(parsed);
    if (parsed.apiKey && !initRef.current) {
      runPosthogInit(parsed);
      setIsInitialized(true);
    }
  }, [runPosthogInit]);

  const initPosthog = useCallback(
    (apiKey: string, apiHost?: string) => {
      const host = apiHost || config.apiHost || "https://us.i.posthog.com";
      if (initRef.current) {
        posthog.reset();
        initRef.current = false;
      }
      // Reset flag state so consumers don't see stale flags from the previous project
      setFlagsReady(false);
      setFeatureFlags({});
      const newConfig: PosthogConfig = { ...config, apiKey, apiHost: host };
      runPosthogInit(newConfig);
      setConfig(newConfig);
      localStorage.setItem("posthog_config", JSON.stringify(newConfig));
      setIsInitialized(true);
      addLog({
        type: "config",
        name: "PostHog Initialized",
        properties: { apiKey: `${apiKey.slice(0, 8)}...`, apiHost: host },
      });
    },
    [config, addLog, runPosthogInit]
  );

  const updateConfig = useCallback(
    (updates: Partial<PosthogConfig>) => {
      // If apiKey is changing, delegate entirely to initPosthog so we have a
      // single writer for localStorage and a single PostHog re-init path.
      if (updates.apiKey && updates.apiKey !== config.apiKey) {
        const nextHost = updates.apiHost || config.apiHost;
        // Apply any non-key updates first so initPosthog picks them up via `config`.
        const nonKeyUpdates = { ...updates };
        delete nonKeyUpdates.apiKey;
        delete nonKeyUpdates.apiHost;
        if (Object.keys(nonKeyUpdates).length > 0) {
          const merged = { ...config, ...nonKeyUpdates };
          setConfig(merged);
        }
        initPosthog(updates.apiKey, nextHost);
        addLog({ type: "config", name: "Config Updated", properties: updates as Record<string, unknown> });
        return;
      }
      const newConfig = { ...config, ...updates };
      setConfig(newConfig);
      localStorage.setItem("posthog_config", JSON.stringify(newConfig));
      addLog({ type: "config", name: "Config Updated", properties: updates as Record<string, unknown> });
    },
    [config, addLog, initPosthog]
  );

  const resetConfig = useCallback(() => {
    if (initRef.current) {
      posthog.reset();
      initRef.current = false;
    }
    setConfig(defaultConfig);
    setIsInitialized(false);
    setFlagsReady(false);
    setFeatureFlags({});
    setLocalPersonProperties({});
    localStorage.removeItem("posthog_config");
    localStorage.removeItem("posthog_pasture_person_props");
    addLog({ type: "config", name: "Config Reset" });
  }, [addLog]);

  const captureEvent = useCallback(
    (eventName: string, properties?: Record<string, unknown>) => {
      if (!isInitialized) return;
      posthog.capture(eventName, properties);
      addLog({ type: "event", name: eventName, properties });
    },
    [isInitialized, addLog]
  );

  const captureException = useCallback(
    (opts: { message: string; type?: string; source?: string; lineno?: number; stackTrace?: string }) => {
      if (!isInitialized) return;
      const exType = opts.type || "Error";

      // Create a real Error object so posthog.captureException can extract the stack trace
      const error = new Error(opts.message);
      error.name = exType;
      if (opts.stackTrace) {
        error.stack = opts.stackTrace;
      }

      // Use PostHog's built-in captureException — it handles $exception_list formatting
      posthog.captureException(error, {
        $exception_source: opts.source || "unknown",
        $exception_lineno: opts.lineno || 0,
      });

      addLog({
        type: "error",
        name: `Exception: ${opts.message}`,
        properties: {
          $exception_type: exType,
          $exception_message: opts.message,
          $exception_source: opts.source || "unknown",
        },
      });
    },
    [isInitialized, addLog]
  );

  const identifyUser = useCallback(
    (userId: string, properties?: Record<string, unknown>) => {
      if (!isInitialized) return;
      posthog.identify(userId, properties);
      if (properties && Object.keys(properties).length > 0) {
        setLocalPersonProperties((prev) => {
          const merged = { ...prev, ...properties };
          localStorage.setItem("posthog_pasture_person_props", JSON.stringify(merged));
          return merged;
        });
      }
      addLog({ type: "identify", name: `Identified: ${userId}`, properties });
    },
    [isInitialized, addLog]
  );

  const resetPerson = useCallback(() => {
    if (!isInitialized) return;
    posthog.reset();
    setLocalPersonProperties({});
    localStorage.removeItem("posthog_pasture_person_props");
    addLog({ type: "person", name: "Person Reset" });
  }, [isInitialized, addLog]);

  const setPersonProperties = useCallback(
    (properties: Record<string, unknown>) => {
      if (!isInitialized) return;
      posthog.setPersonProperties(properties);
      setLocalPersonProperties((prev) => {
        const merged = { ...prev, ...properties };
        localStorage.setItem("posthog_pasture_person_props", JSON.stringify(merged));
        return merged;
      });
      addLog({ type: "person", name: "Person Properties Set", properties });
    },
    [isInitialized, addLog]
  );

  const groupIdentify = useCallback(
    (groupType: string, groupKey: string, properties?: Record<string, unknown>) => {
      if (!isInitialized) return;
      posthog.group(groupType, groupKey, properties);
      addLog({ type: "group", name: `Group: ${groupType}/${groupKey}`, properties });
    },
    [isInitialized, addLog]
  );

  const capturePageview = useCallback(
    (url?: string) => {
      if (!isInitialized) return;
      posthog.capture("$pageview", url ? { $current_url: url } : undefined);
      addLog({ type: "pageview", name: "Pageview", properties: url ? { url } : undefined });
    },
    [isInitialized, addLog]
  );

  const registerSuperProperties = useCallback(
    (properties: Record<string, unknown>) => {
      if (!isInitialized) return;
      posthog.register(properties);
      addLog({ type: "config", name: "Super Properties Registered", properties });
    },
    [isInitialized, addLog]
  );

  const unregisterSuperProperty = useCallback(
    (key: string) => {
      if (!isInitialized) return;
      posthog.unregister(key);
      addLog({ type: "config", name: `Super Property Removed: ${key}` });
    },
    [isInitialized, addLog]
  );

  const optIn = useCallback(() => {
    if (!isInitialized) return;
    posthog.opt_in_capturing();
    setIsOptedOut(false);
    addLog({ type: "config", name: "Opted In" });
  }, [isInitialized, addLog]);

  const optOut = useCallback(() => {
    if (!isInitialized) return;
    posthog.opt_out_capturing();
    setIsOptedOut(true);
    addLog({ type: "config", name: "Opted Out" });
  }, [isInitialized, addLog]);

  const reloadFeatureFlags = useCallback(() => {
    if (!isInitialized) return;
    posthog.reloadFeatureFlags();
  }, [isInitialized]);

  // Like reloadFeatureFlags but also fires $feature_flag_called for each flag
  const reloadFeatureFlagsAndCapture = useCallback(() => {
    if (!isInitialized) return;
    fireFlagEventsRef.current = true;
    posthog.reloadFeatureFlags();
  }, [isInitialized]);

  const startSessionRecording = useCallback(() => {
    if (!isInitialized) return;
    posthog.startSessionRecording();
    setIsRecording(true);
    addLog({ type: "recording", name: "Session Recording Started" });
  }, [isInitialized, addLog]);

  const stopSessionRecording = useCallback(() => {
    if (!isInitialized) return;
    posthog.stopSessionRecording();
    setIsRecording(false);
    addLog({ type: "recording", name: "Session Recording Stopped" });
  }, [isInitialized, addLog]);

  const clearRequestError = useCallback(() => setLastRequestError(null), []);

  return (
    <PosthogContext.Provider
      value={{
        config,
        isInitialized,
        eventLog,
        localPersonProperties,
        initPosthog,
        updateConfig,
        resetConfig,
        captureEvent,
        captureException,
        identifyUser,
        resetPerson,
        setPersonProperties,
        groupIdentify,
        capturePageview,
        registerSuperProperties,
        unregisterSuperProperty,
        optIn,
        optOut,
        isOptedOut,
        featureFlags,
        flagsReady,
        reloadFeatureFlags,
        reloadFeatureFlagsAndCapture,
        startSessionRecording,
        stopSessionRecording,
        isRecording,
        addLog,
        lastRequestError,
        clearRequestError,
      }}
    >
      {children}
    </PosthogContext.Provider>
  );
}

export function usePosthog() {
  const context = useContext(PosthogContext);
  if (!context) throw new Error("usePosthog must be used within PosthogProvider");
  return context;
}
