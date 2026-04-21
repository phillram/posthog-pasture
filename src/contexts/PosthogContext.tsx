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
  initPosthog: (apiKey: string, apiHost?: string) => void;
  updateConfig: (updates: Partial<PosthogConfig>) => void;
  resetConfig: () => void;
  captureEvent: (eventName: string, properties?: Record<string, unknown>) => void;
  captureException: (opts: { message: string; type?: string; source?: string; lineno?: number; stackTrace?: string }) => void;
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
  reloadFeatureFlags: () => void;
  startSessionRecording: () => void;
  stopSessionRecording: () => void;
  isRecording: boolean;
  addLog: (entry: { type: EventLogEntry["type"]; name: string; properties?: Record<string, unknown> }) => void;
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
  const [isOptedOut, setIsOptedOut] = useState(false);
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean | string>>({});
  const [isRecording, setIsRecording] = useState(false);
  const initRef = useRef(false);

  const addLog = useCallback((entry: Omit<EventLogEntry, "id" | "timestamp">) => {
    setEventLog((prev) => [
      { ...entry, id: crypto.randomUUID(), timestamp: new Date() },
      ...prev.slice(0, 99),
    ]);
  }, []);

  // Load config from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("posthog_config");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setConfig(parsed);
        if (parsed.apiKey && !initRef.current) {
          initRef.current = true;
          posthog.init(parsed.apiKey, {
            api_host: parsed.apiHost || "https://us.i.posthog.com",
            autocapture: parsed.autocapture ?? true,
            capture_pageview: parsed.capturePageview ?? true,
            capture_pageleave: parsed.capturePageleave ?? true,
            debug: true,
            disable_session_recording: parsed.disableSessionRecording ?? false,
          });
          setIsInitialized(true);
          if (typeof window !== "undefined") {
            (window as unknown as Record<string, unknown>).posthog = posthog;
          }
        }
      } catch {
        // ignore invalid JSON
      }
    }
  }, []);

  const initPosthog = useCallback(
    (apiKey: string, apiHost?: string) => {
      const host = apiHost || config.apiHost || "https://us.i.posthog.com";
      if (initRef.current) {
        posthog.reset();
        initRef.current = false;
      }
      posthog.init(apiKey, {
        api_host: host,
        autocapture: config.autocapture,
        capture_pageview: config.capturePageview,
        capture_pageleave: config.capturePageleave,
        debug: true,
        disable_session_recording: config.disableSessionRecording,
      });
      initRef.current = true;
      const newConfig = { ...config, apiKey, apiHost: host };
      setConfig(newConfig);
      localStorage.setItem("posthog_config", JSON.stringify(newConfig));
      setIsInitialized(true);
      if (typeof window !== "undefined") {
        (window as unknown as Record<string, unknown>).posthog = posthog;
      }
      addLog({ type: "config", name: "PostHog Initialized", properties: { apiKey: `${apiKey.slice(0, 8)}...`, apiHost: host } });
    },
    [config, addLog]
  );

  const updateConfig = useCallback(
    (updates: Partial<PosthogConfig>) => {
      const newConfig = { ...config, ...updates };
      setConfig(newConfig);
      localStorage.setItem("posthog_config", JSON.stringify(newConfig));
      addLog({ type: "config", name: "Config Updated", properties: updates as Record<string, unknown> });
      // Re-init if key changed
      if (updates.apiKey && updates.apiKey !== config.apiKey) {
        initPosthog(updates.apiKey, newConfig.apiHost);
      }
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
    localStorage.removeItem("posthog_config");
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
      addLog({ type: "identify", name: `Identified: ${userId}`, properties });
    },
    [isInitialized, addLog]
  );

  const resetPerson = useCallback(() => {
    if (!isInitialized) return;
    posthog.reset();
    addLog({ type: "person", name: "Person Reset" });
  }, [isInitialized, addLog]);

  const setPersonProperties = useCallback(
    (properties: Record<string, unknown>) => {
      if (!isInitialized) return;
      posthog.setPersonProperties(properties);
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
    posthog.reloadFeatureFlags(() => {
      const flags = posthog.featureFlags.getFlagVariants();
      setFeatureFlags(flags as Record<string, boolean | string>);
      addLog({ type: "flag", name: "Feature Flags Reloaded", properties: flags as Record<string, unknown> });
    });
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

  return (
    <PosthogContext.Provider
      value={{
        config,
        isInitialized,
        eventLog,
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
        reloadFeatureFlags,
        startSessionRecording,
        stopSessionRecording,
        isRecording,
        addLog,
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
