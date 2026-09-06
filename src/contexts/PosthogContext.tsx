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
  initPosthog: (apiKey: string, apiHost?: string, redirectTo?: string) => void;
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
  registerForSession: (properties: Record<string, unknown>) => void;
  unregisterForSession: (key: string) => void;
  setPersonPropertiesForFlags: (properties: Record<string, unknown>) => void;
  unsetPersonProperties: (names: string[]) => void;
  resetGroups: () => void;
  optIn: () => void;
  optOut: () => void;
  isOptedOut: boolean;
  /** PostHog's own consent record: granted, denied, or pending. */
  consentStatus: "granted" | "denied" | "pending";
  featureFlags: Record<string, boolean | string>;
  flagsReady: boolean;
  flagsFailed: boolean;
  /** JSON payload attached to a flag in PostHog, or undefined if it has none. */
  getFlagPayload: (key: string) => unknown;
  reloadFeatureFlags: () => void;
  reloadFeatureFlagsAndCapture: () => void;
  armFlagsReadyLog: () => void;
  flagOverrides: Record<string, boolean | string>;
  setFlagOverride: (key: string, value: boolean | string) => void;
  clearFlagOverrides: () => void;
  startSessionRecording: () => void;
  stopSessionRecording: () => void;
  isRecording: boolean;
  /** Deep link to the current session in PostHog, or null before one starts. */
  getSessionReplayUrl: () => string | null;
  exceptionAutocapture: boolean;
  setExceptionAutocapture: (enabled: boolean) => void;
  addLog: (entry: { type: EventLogEntry["type"]; name: string; properties?: Record<string, unknown> }) => void;
  clearEventLog: () => void;
  lastRequestError: { status: number; message: string; at: number } | null;
  clearRequestError: () => void;
}

interface EventLogEntry {
  id: string;
  timestamp: Date;
  type: "event" | "identify" | "pageview" | "group" | "error" | "config" | "person" | "flag" | "recording" | "journey";
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

// posthog-js keeps client-side flag overrides in its own persistence store
// under this key. Reading it back is what lets the UI survive a page reload
// without a second, drifting copy of the same state.
const OVERRIDE_PERSISTENCE_KEY = "$override_feature_flags";

function readStoredFlagOverrides(): Record<string, boolean | string> {
  const props = (posthog as unknown as { persistence?: { props?: Record<string, unknown> } }).persistence?.props;
  const stored = props?.[OVERRIDE_PERSISTENCE_KEY];
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
  const result: Record<string, boolean | string> = {};
  for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
    if (typeof value === "boolean" || typeof value === "string") result[key] = value;
  }
  return result;
}

export function PosthogProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<PosthogConfig>(defaultConfig);
  const [isInitialized, setIsInitialized] = useState(false);
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [localPersonProperties, setLocalPersonProperties] = useState<Record<string, unknown>>({});
  const [isOptedOut, setIsOptedOut] = useState(false);
  const [consentStatus, setConsentStatus] = useState<"granted" | "denied" | "pending">("pending");
  // capture_exceptions is on at init, so this mirrors that until it is toggled.
  const [exceptionAutocapture, setExceptionAutocaptureState] = useState(true);
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean | string>>({});
  const [flagsReady, setFlagsReady] = useState(false);
  const [flagsFailed, setFlagsFailed] = useState(false);
  const [flagOverrides, setFlagOverrides] = useState<Record<string, boolean | string>>({});
  const [isRecording, setIsRecording] = useState(false);
  const [lastRequestError, setLastRequestError] = useState<{
    status: number;
    message: string;
    at: number;
  } | null>(null);
  const initRef = useRef(false);
  // The key + host the running SDK instance actually uses. posthog-js ignores a
  // second init() call, so this is the only reliable record of which project
  // events are going to. initPosthog compares against it to decide whether a
  // page reload is needed.
  const activeConnectionRef = useRef<{ apiKey: string; apiHost: string } | null>(null);
  // When true, the next onFeatureFlags callback will fire $feature_flag_called for each flag
  const fireFlagEventsRef = useRef(false);
  // When true, the next onFeatureFlags callback will log a "Feature Flags
  // Ready" entry to the local Event Log. Callers arm this before a
  // deliberate flag fetch (login, Reload Flags click) so passive reloads —
  // initial page hydration, override toggles, identify side-effects — stay
  // quiet.
  const logFlagsReadyRef = useRef(false);
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
      // No-code (web) experiments are disabled by default in posthog-js.
      // This sandbox needs them enabled so the Experiments UI can run.
      disable_web_experiments: false,
      // The Errors page only exercises manual captureException() calls. Turn
      // on real uncaught-error/unhandled-rejection autocapture too, since
      // that's a PostHog feature this sandbox should also let you test.
      capture_exceptions: true,
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
            "$rageclick",
          ]);
          if (!SKIP_LOG_EVENTS.has(e)) {
            let type: EventLogEntry["type"] = "event";
            if (e === "$pageview" || e === "$pageleave") type = "pageview";
            else if (e === "$exception") type = "error";
            else if (e === "$identify" || e === "$create_alias") type = "identify";
            else if (e === "$set" || e === "$set_once") type = "person";
            else if (e === "$groupidentify") type = "group";
            else if (e === "$feature_flag_called") type = "flag";
            else if (e.startsWith("pasture_journeys_") || e.startsWith("pasture_journey_")) type = "journey";
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
          setFlagsFailed(false);
          if (flagsWatchdogRef.current) {
            clearTimeout(flagsWatchdogRef.current);
            flagsWatchdogRef.current = null;
          }
          if (logFlagsReadyRef.current) {
            logFlagsReadyRef.current = false;
            addLogRef.current({
              type: "flag",
              name: "Feature Flags Ready",
              properties: variants as Record<string, unknown>,
            });
          }
        });
      },
    });
    initRef.current = true;
    activeConnectionRef.current = { apiKey: cfg.apiKey, apiHost: cfg.apiHost };
    // posthog-js persists opt-out and flag overrides, so read both back rather
    // than assuming a fresh state on every page load.
    setIsOptedOut(posthog.has_opted_out_capturing());
    setConsentStatus(posthog.get_explicit_consent_status());
    setFlagOverrides(readStoredFlagOverrides());
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
      // Release every consumer that waits on flagsReady. A blocked /flags
      // request must not lock the app out of the pages that explain the block.
      setFlagsFailed(true);
      setFlagsReady(true);
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
    (apiKey: string, apiHost?: string, redirectTo?: string) => {
      const host = apiHost || config.apiHost || "https://us.i.posthog.com";
      const newConfig: PosthogConfig = { ...config, apiKey, apiHost: host };
      localStorage.setItem("posthog_config", JSON.stringify(newConfig));
      setConfig(newConfig);

      const active = activeConnectionRef.current;
      const sameProject = active?.apiKey === apiKey && active?.apiHost === host;

      if (initRef.current && !sameProject) {
        // posthog-js refuses a second init() on a loaded instance: it logs
        // "Re-initializing is a no-op" and keeps the original token. reset()
        // does not clear that flag either. A full page load is the only way to
        // point the SDK at a different project, so do it rather than leaving
        // the UI claiming a connection the SDK never made.
        addLog({
          type: "config",
          name: "Reconnecting to a different project",
          properties: { apiKey: `${apiKey.slice(0, 8)}...`, apiHost: host },
        });
        window.location.assign(redirectTo ?? window.location.pathname);
        return;
      }

      if (initRef.current) {
        // Same project, already connected. Nothing to re-init.
        setIsInitialized(true);
        if (redirectTo) window.location.assign(redirectTo);
        return;
      }

      // Reset flag state so consumers don't see stale flags from the previous project
      setFlagsReady(false);
      setFlagsFailed(false);
      setFeatureFlags({});
      // Connecting to a fresh project should announce its first ready event
      logFlagsReadyRef.current = true;
      runPosthogInit(newConfig);
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
      // Push the capture settings into the running SDK. Without this the
      // toggles only ever changed localStorage, so autocapture, pageview
      // capture, pageleave capture, and session recording kept the values
      // they had at init. posthog-js reads all four live, so set_config is
      // enough — no reconnect, no page reload.
      if (initRef.current) {
        posthog.set_config({
          autocapture: newConfig.autocapture,
          capture_pageview: newConfig.capturePageview,
          capture_pageleave: newConfig.capturePageleave,
          disable_session_recording: newConfig.disableSessionRecording,
        });
      }
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
    activeConnectionRef.current = null;
    setConfig(defaultConfig);
    setIsInitialized(false);
    setFlagsReady(false);
    setFlagsFailed(false);
    setFeatureFlags({});
    setFlagOverrides({});
    setLocalPersonProperties({});
    setEventLog([]);
    setIsOptedOut(false);
    setConsentStatus("pending");
    setExceptionAutocaptureState(true);
    setIsRecording(false);
    setLastRequestError(null);
    logFlagsReadyRef.current = false;
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

  // Session-scoped super properties. Unlike register(), these clear when the
  // session ends, which is what you want for "campaign this visit came from".
  const registerForSession = useCallback(
    (properties: Record<string, unknown>) => {
      if (!isInitialized) return;
      posthog.register_for_session(properties);
      addLog({ type: "config", name: "Session Properties Registered", properties });
    },
    [isInitialized, addLog]
  );

  const unregisterForSession = useCallback(
    (key: string) => {
      if (!isInitialized) return;
      posthog.unregister_for_session(key);
      addLog({ type: "config", name: `Session Property Removed: ${key}` });
    },
    [isInitialized, addLog]
  );

  // Properties used only to evaluate flags. They never become person
  // properties, so they are the way to test targeting without writing to the
  // person. The second argument reloads flags so the effect is visible.
  const setPersonPropertiesForFlags = useCallback(
    (properties: Record<string, unknown>) => {
      if (!isInitialized) return;
      posthog.setPersonPropertiesForFlags(properties, true);
      addLog({ type: "flag", name: "Flag Person Properties Set", properties });
    },
    [isInitialized, addLog]
  );

  const unsetPersonProperties = useCallback(
    (names: string[]) => {
      if (!isInitialized || names.length === 0) return;
      posthog.unsetPersonProperties(names);
      setLocalPersonProperties((prev) => {
        const next = { ...prev };
        for (const name of names) delete next[name];
        localStorage.setItem("posthog_pasture_person_props", JSON.stringify(next));
        return next;
      });
      addLog({ type: "person", name: "Person Properties Unset", properties: { names } });
    },
    [isInitialized, addLog]
  );

  const resetGroups = useCallback(() => {
    if (!isInitialized) return;
    posthog.resetGroups();
    addLog({ type: "group", name: "Groups Reset" });
  }, [isInitialized, addLog]);

  const getFlagPayload = useCallback(
    (key: string) => {
      if (!isInitialized) return undefined;
      return posthog.getFeatureFlagPayload(key);
    },
    [isInitialized]
  );

  const getSessionReplayUrl = useCallback(() => {
    if (!isInitialized) return null;
    // Returns an empty string until a recording has started.
    return posthog.get_session_replay_url({ withTimestamp: true }) || null;
  }, [isInitialized]);

  const setExceptionAutocapture = useCallback(
    (enabled: boolean) => {
      if (!isInitialized) return;
      if (enabled) posthog.startExceptionAutocapture();
      else posthog.stopExceptionAutocapture();
      setExceptionAutocaptureState(enabled);
      addLog({ type: "config", name: `Exception Autocapture ${enabled ? "Started" : "Stopped"}` });
    },
    [isInitialized, addLog]
  );

  const optIn = useCallback(() => {
    if (!isInitialized) return;
    // Fires a $opt_in event which the before_send hook already logs.
    posthog.opt_in_capturing();
    setIsOptedOut(false);
    setConsentStatus(posthog.get_explicit_consent_status());
  }, [isInitialized]);

  const optOut = useCallback(() => {
    if (!isInitialized) return;
    posthog.opt_out_capturing();
    setIsOptedOut(true);
    setConsentStatus(posthog.get_explicit_consent_status());
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

  // Arm the next onFeatureFlags callback to add a "Feature Flags Ready" entry
  // to the local Event Log. Used by deliberate user actions (login, Reload
  // Flags click) so passive flag re-evaluations don't spam the log.
  const armFlagsReadyLog = useCallback(() => {
    logFlagsReadyRef.current = true;
  }, []);

  // posthog-js stores the override map as one value, so every call has to send
  // the complete map. Sending a single key wipes every other override.
  const setFlagOverride = useCallback(
    (key: string, value: boolean | string) => {
      if (!isInitialized) return;
      setFlagOverrides((prev) => {
        const next = { ...prev, [key]: value };
        posthog.featureFlags.overrideFeatureFlags({ flags: next });
        return next;
      });
      addLog({ type: "flag", name: `Flag Override: ${key}`, properties: { flag: key, value } });
    },
    [isInitialized, addLog]
  );

  const clearFlagOverrides = useCallback(() => {
    if (!isInitialized) return;
    posthog.featureFlags.overrideFeatureFlags(false);
    setFlagOverrides({});
    addLog({ type: "flag", name: "All Flag Overrides Cleared" });
  }, [isInitialized, addLog]);

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

  const clearEventLog = useCallback(() => {
    setEventLog([]);
    try {
      sessionStorage.removeItem(EVENT_LOG_STORAGE_KEY);
    } catch {
      // ignore quota / disabled-storage errors — in-memory state is still cleared
    }
  }, []);

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
        registerForSession,
        unregisterForSession,
        setPersonPropertiesForFlags,
        unsetPersonProperties,
        resetGroups,
        optIn,
        optOut,
        isOptedOut,
        consentStatus,
        featureFlags,
        flagsReady,
        flagsFailed,
        getFlagPayload,
        reloadFeatureFlags,
        reloadFeatureFlagsAndCapture,
        armFlagsReadyLog,
        flagOverrides,
        setFlagOverride,
        clearFlagOverrides,
        startSessionRecording,
        stopSessionRecording,
        isRecording,
        getSessionReplayUrl,
        exceptionAutocapture,
        setExceptionAutocapture,
        addLog,
        clearEventLog,
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
