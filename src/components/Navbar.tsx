"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { usePosthog } from "@/contexts/PosthogContext";

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const { isInitialized, isRecording } = usePosthog();

  return (
    <nav className="bg-card border-b border-border px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-lg font-bold text-primary hover:text-primary-hover transition-colors"
        >
          <span className="text-2xl">🦔</span>
          <span>PostHog Pasture</span>
        </Link>
        {isAuthenticated && (
          <div className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-muted hover:text-foreground transition-colors">
              📊 Dashboard
            </Link>
            <Link href="/event-log" className="text-muted hover:text-foreground transition-colors">
              📋 Event Log
            </Link>
            <Link href="/flags" className="text-muted hover:text-foreground transition-colors">
              🚩 Flags
            </Link>
            <Link href="/experiments" className="text-muted hover:text-foreground transition-colors">
              🧪 Experiments
            </Link>
            <Link href="/events" className="text-muted hover:text-foreground transition-colors">
              📖 Event Reference
            </Link>
            <Link href="/config" className="text-muted hover:text-foreground transition-colors">
              ⚙️ Config
            </Link>
          </div>
        )}
      </div>
      <div className="flex items-center gap-4">
        {isRecording && (
          <div className="flex items-center gap-1.5 text-xs text-error font-medium" title="Session recording is active">
            <span className="w-2 h-2 bg-error rounded-full animate-pulse" />
            REC
          </div>
        )}
        <div
          className={`w-2 h-2 rounded-full ${isInitialized ? "bg-success" : "bg-error"}`}
          title={isInitialized ? "PostHog Connected" : "PostHog Not Connected"}
        />
        {isAuthenticated && (
          <>
            <span className="text-sm text-muted">{user?.isGuest ? "Guest" : user?.name}</span>
            <button onClick={logout} className="text-sm text-error hover:text-red-400 transition-colors">
              Logout
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
