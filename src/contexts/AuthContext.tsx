"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { usePosthog } from "./PosthogContext";

interface User {
  id: string;
  email: string;
  name: string;
  isGuest: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (usernameOrEmail: string, password: string, applyFeatureFlags?: boolean) => boolean;
  register: (email: string, name: string, password: string, applyFeatureFlags?: boolean) => boolean;
  loginAsGuest: (applyFeatureFlags?: boolean) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { identifyUser, captureEvent, resetPerson, reloadFeatureFlagsAndCapture, armFlagsReadyLog } = usePosthog();

  useEffect(() => {
    // Hydrate from localStorage on mount — this is a client-only read, so it must
    // happen in an effect to stay SSR-safe. The react-hooks/set-state-in-effect
    // rule flags this pattern but it's correct here.
    const saved = localStorage.getItem("posthog_user");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUser(parsed);
      } catch (err) {
        console.warn("Corrupt posthog_user in localStorage, clearing:", err);
        localStorage.removeItem("posthog_user");
      }
    }
    setIsLoading(false);
  }, []);

  // Track user id in a ref so logout can read it without adding `user` to
  // its dependency array (which would re-create logout on every user change).
  const userIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user]);

  // posthog-js auto-fetches /flags on identify(), so we deliberately do not
  // call identifyUser on every render or rehydration — that would re-issue
  // /flags + $set on every page navigation. Instead, login/register/loginAsGuest
  // identify the user exactly once at the auth event itself. On page reload,
  // posthog-js's own persistence (cookies/localStorage) keeps the distinct_id
  // set, so re-identifying is unnecessary.

  // NOTE: This is demo auth for the PostHog sandbox — the password is hardcoded
  // to "test" intentionally so anyone can try the app without a real backend.
  // Do not copy this pattern into production code.
  const login = useCallback(
    (usernameOrEmail: string, password: string, applyFeatureFlags = false) => {
      if (password !== "test") return false;
      const isEmail = usernameOrEmail.includes("@");
      const username = isEmail ? usernameOrEmail.split("@")[0] : usernameOrEmail;
      const u: User = {
        id: username,
        email: isEmail ? usernameOrEmail : "",
        name: username,
        isGuest: false,
      };
      setUser(u);
      localStorage.setItem("posthog_user", JSON.stringify(u));
      // Arm the Event Log so the /flags fetch triggered by identify gets
      // a "Feature Flags Ready" entry — this is one of the two moments
      // (login + Reload Flags click) where the user expects to see it.
      armFlagsReadyLog();
      identifyUser(u.id, { email: u.email, name: u.name });
      captureEvent("pasture_user_logged_in", { method: isEmail ? "email" : "username", username });
      // posthog.identify already triggers a /flags fetch — only re-call when
      // the user opted in to also fire $feature_flag_called for each flag.
      if (applyFeatureFlags) {
        reloadFeatureFlagsAndCapture();
      }
      return true;
    },
    [armFlagsReadyLog, captureEvent, identifyUser, reloadFeatureFlagsAndCapture]
  );

  // `_password` is intentionally unused — this is a demo registration flow
  // that always succeeds so users can test PostHog's identify/capture paths.
  const register = useCallback(
    (email: string, name: string, _password: string, applyFeatureFlags = false) => {
      const username = name || email.split("@")[0];
      const u: User = {
        id: username,
        email,
        name: username,
        isGuest: false,
      };
      setUser(u);
      localStorage.setItem("posthog_user", JSON.stringify(u));
      armFlagsReadyLog();
      identifyUser(u.id, { email: u.email, name: u.name });
      captureEvent("pasture_user_registered", { method: "email", email, name: username });
      // See login() — identify already fetches flags; only re-call when the
      // user wants $feature_flag_called events fired too.
      if (applyFeatureFlags) {
        reloadFeatureFlagsAndCapture();
      }
      return true;
    },
    [armFlagsReadyLog, captureEvent, identifyUser, reloadFeatureFlagsAndCapture]
  );

  const loginAsGuest = useCallback(
    (applyFeatureFlags = false) => {
      armFlagsReadyLog();
      resetPerson();
      const guestId = `guest_${Date.now()}`;
      const u: User = {
        id: guestId,
        email: "",
        name: "Guest",
        isGuest: true,
      };
      setUser(u);
      localStorage.setItem("posthog_user", JSON.stringify(u));
      captureEvent("pasture_user_logged_in", { method: "guest", guest_id: guestId });
      // resetPerson() already triggers PostHog to refresh its anonymous identity
      // and re-fetch flags. Only force another reload if the user opted in to
      // capture $feature_flag_called events.
      if (applyFeatureFlags) {
        reloadFeatureFlagsAndCapture();
      }
    },
    [armFlagsReadyLog, captureEvent, resetPerson, reloadFeatureFlagsAndCapture]
  );

  const logout = useCallback(() => {
    captureEvent("pasture_user_logged_out", { user_id: userIdRef.current });
    resetPerson();
    setUser(null);
    localStorage.removeItem("posthog_user");
  }, [captureEvent, resetPerson]);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, register, loginAsGuest, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
