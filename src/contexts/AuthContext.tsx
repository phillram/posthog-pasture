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
  login: (usernameOrEmail: string, password: string) => boolean;
  register: (email: string, name: string, password: string) => boolean;
  loginAsGuest: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { identifyUser, captureEvent, resetPerson, reloadFeatureFlags, isInitialized } = usePosthog();

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

  // Identify user whenever they're set and posthog is ready (skip guests),
  // then reload feature flags so they're evaluated for the identified user.
  useEffect(() => {
    if (user && !user.isGuest && isInitialized) {
      identifyUser(user.id, {
        email: user.email,
        name: user.name,
      });
      reloadFeatureFlags();
    }
  }, [user, isInitialized, identifyUser, reloadFeatureFlags]);

  const login = useCallback(
    (usernameOrEmail: string, password: string) => {
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
      captureEvent("user_logged_in", { method: isEmail ? "email" : "username", username });
      return true;
    },
    [captureEvent]
  );

  const register = useCallback(
    (email: string, name: string, _password: string) => {
      const username = name || email.split("@")[0];
      const u: User = {
        id: username,
        email,
        name: username,
        isGuest: false,
      };
      setUser(u);
      localStorage.setItem("posthog_user", JSON.stringify(u));
      captureEvent("user_registered", { method: "email", email, name: username });
      return true;
    },
    [captureEvent]
  );

  const loginAsGuest = useCallback(() => {
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
    captureEvent("user_logged_in", { method: "guest", guest_id: guestId });
    reloadFeatureFlags();
  }, [captureEvent, resetPerson, reloadFeatureFlags]);

  const logout = useCallback(() => {
    captureEvent("user_logged_out", { user_id: user?.id });
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
