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
  const { identifyUser, captureEvent, resetPerson, reloadFeatureFlags, reloadFeatureFlagsAndCapture, isInitialized } =
    usePosthog();

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

  // Identify user whenever they're set and posthog is ready (skip guests).
  // Note: feature flag reloading is triggered manually in login/register to
  // support the optional applyFeatureFlags behaviour.
  useEffect(() => {
    if (user && !user.isGuest && isInitialized) {
      identifyUser(user.id, {
        email: user.email,
        name: user.name,
      });
    }
  }, [user, isInitialized, identifyUser]);

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
      captureEvent("pasture_user_logged_in", { method: isEmail ? "email" : "username", username });
      if (applyFeatureFlags) {
        reloadFeatureFlagsAndCapture();
      } else {
        reloadFeatureFlags();
      }
      return true;
    },
    [captureEvent, reloadFeatureFlags, reloadFeatureFlagsAndCapture]
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
      captureEvent("pasture_user_registered", { method: "email", email, name: username });
      if (applyFeatureFlags) {
        reloadFeatureFlagsAndCapture();
      } else {
        reloadFeatureFlags();
      }
      return true;
    },
    [captureEvent, reloadFeatureFlags, reloadFeatureFlagsAndCapture]
  );

  const loginAsGuest = useCallback(
    (applyFeatureFlags = false) => {
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
      if (applyFeatureFlags) {
        reloadFeatureFlagsAndCapture();
      } else {
        reloadFeatureFlags();
      }
    },
    [captureEvent, resetPerson, reloadFeatureFlags, reloadFeatureFlagsAndCapture]
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
