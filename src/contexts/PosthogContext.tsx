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
  // Watchdog for the initial /flags request — posthog-js's on_request_error
  // only fires on HTTP >= 400, so silent network failures (ad blockers, CORS,
  // offline) leave us with no visible error. If flags don't arrive in time,
  // we surface that as an event-log error ourselves.
  const flagsWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const MAX_LOG_ENTRIES = 100;
  const FLAGS_LOAD_TIMEOUT_MS = 8000;
  const EVENT_LOG_STORAGE_KEY = "posthog_pasture_event_log";

  // Hydrate eventLog from sessionStorage on mount so the log survives page
  // navigation and reloads within the same tab session.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = sessionStorage.getItem(EVENT_LOG_STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as Array<Omit<EventLogEntry, "timestamp"> & { timestamp: string }>;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEventLog(parsed.map((e) => ({ ...e, timestamp: new Date(e.timestamp) })));
    } catch {
      sessionStorage.removeItem(EVENT_LOG_STORAGE_KEY);
    }
  }, []);

  const addLog = useCallback((entry: Omit<EventLogEntry, "id" | "timestamp">) => {
    setEventLog((prev) => {
      const next = [
        { ...entry, id: crypto.randomUUID(), timestamp: new Date() },
        ...prev.slice(0, MAX_LOG_ENTRIES - 1),
      ];
      try {
        sessionStorage.setItem(EVENT_LOG_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore quota / disabled-storage errors — in-memory state is still the source of truth
      }
      return next;
    });
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
      // Single source of truth for the local Event Log. Every event the SDK
      // captures — including autocaptured clicks, $pageview, $pageleave,
      // $exception, $identify, $set, $feature_flag_called, $autocapture, etc. —
      // flows through here, so the log mirrors what's actually being sent to
      // PostHog rather than only the events fired through our wrappers.
      before_send: (event) => {
        if (event) {
          const e = event.event;
          // Skip high-frequency / autocaptured events from the local Event Log
          // so it stays readable. They're still sent to PostHog as normal.
          const SKIP_LOG_EVENTS = new Set([
            "$$heatmap",
            "$web_vitals",
            "web_vitals",
            "$pageview",
            "$pageleave",
            "$autocapture",
          ]);
          if (!SKIP_LOG_EVENTS.has(e)) {
            let type: EventLogEntry["type"] = "event";
            if (e === "$pageview" || e === "$pageleave") type = "pageview";
            else if (e === "$exception") type = "error";
            else if (e === "$identify" || e === "$create_alias") type = "identify";
            else if (e === "$set" || e === "$set_once") type = "person";
            else if (e === "$groupidentify") type = "group";
            else if (e === "$feature_flag_called") type = "flag";
            addLogRef.current({ type, name: e, properties: event.properties });
          }
        }
        return event;
      },
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
        ph.onFeatureFlags((_flags, variants) => {
          // Only fire $feature_flag_called events when explicitly requested
          // (e.g. when the user logs in with "Apply feature flags" enabled)
          if (fireFlagEventsRef.current) {
            Object.entries(variants).forEach(([key, value]) =>
              ph.capture("$feature_flag_called", {
                $feature_flag: key,
                $feature_flag_response: value,
              })
            );
            fireFlagEventsRef.current = false;
          }
          setFeatureFlags(variants);
          setFlagsReady(true);
          if (flagsWatchdogRef.current) {
            clearTimeout(flagsWatchdogRef.current);
            flagsWatchdogRef.current = null;
          }
          addLogRef.current({
            type: "flag",
            name: "Feature Flags Ready",
            properties: variants as Record<string, unknown>,
          });
        });
      },
    });
    initRef.current = true;
    if (flagsWatchdogRef.current) clearTimeout(flagsWatchdogRef.current);
    flagsWatchdogRef.current = setTimeout(() => {
      flagsWatchdogRef.current = null;
      const message =
        "Feature flags didn't load — likely blocked by an ad blocker, CORS, or network error. Check the browser DevTools Network tab for the /flags request.";
      addLogRef.current({
        type: "error",
        name: "Feature flags request failed silently",
        properties: { status: 0, message, host: cfg.apiHost },
      });
      setLastRequestError({ status: 0, message, at: Date.now() });
    }, FLAGS_LOAD_TIMEOUT_MS);
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
    if (flagsWatchdogRef.current) {
      clearTimeout(flagsWatchdogRef.current);
      flagsWatchdogRef.current = null;
    }
    setConfig(defaultConfig);
    setIsInitialized(false);
    setFlagsReady(false);
    setFeatureFlags({});
    setLocalPersonProperties({});
    setEventLog([]);
    localStorage.removeItem("posthog_config");
    localStorage.removeItem("posthog_pasture_person_props");
    sessionStorage.removeItem(EVENT_LOG_STORAGE_KEY);
    addLog({ type: "config", name: "Config Reset" });
  }, [addLog]);

  // The Event Log entries for these wrappers come from the `before_send` hook
  // configured in runPosthogInit, so we don't double-log here. That hook is
  // also the only path that catches autocaptured events ($autocapture,
  // $pageview, $pageleave, $exception, $set, $feature_flag_called, …).
  const captureEvent = useCallback(
    (eventName: string, properties?: Record<string, unknown>) => {
      if (!isInitialized) return;
      posthog.capture(eventName, properties);
    },
    [isInitialized]
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
    },
    [isInitialized]
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
    },
    [isInitialized]
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
    },
    [isInitialized]
  );

  const groupIdentify = useCallback(
    (groupType: string, groupKey: string, properties?: Record<string, unknown>) => {
      if (!isInitialized) return;
      posthog.group(groupType, groupKey, properties);
    },
    [isInitialized]
  );

  const capturePageview = useCallback(
    (url?: string) => {
      if (!isInitialized) return;
      posthog.capture("$pageview", url ? { $current_url: url } : undefined);
    },
    [isInitialized]
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
    // Fires a $opt_in event which the before_send hook already logs.
    posthog.opt_in_capturing();
    setIsOptedOut(false);
  }, [isInitialized]);

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
