"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
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
  const { identifyUser, captureEvent, resetPerson, reloadFeatureFlags, reloadFeatureFlagsAndCapture, isInitialized } = usePosthog();

  useEffect(() => {
    const saved = localStorage.getItem("posthog_user");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setUser(parsed);
      } catch {
        // ignore
      }
    }
    setIsLoading(false);
  }, []);

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

  const loginAsGuest = useCallback((applyFeatureFlags = false) => {
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
  }, [captureEvent, resetPerson, reloadFeatureFlags, reloadFeatureFlagsAndCapture]);

  const logout = useCallback(() => {
    captureEvent("pasture_user_logged_out", { user_id: user?.id });
    resetPerson();
    setUser(null);
    localStorage.removeItem("posthog_user");
  }, [captureEvent, resetPerson, user]);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, isLoading, login, register, loginAsGuest, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
