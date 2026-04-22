"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { usePosthog } from "@/contexts/PosthogContext";

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const { isRecording, lastResponse } = usePosthog();

  let lastResponseBadge: ReactNode = null;
  if (lastResponse) {
    const okBg = lastResponse.ok ? "bg-success/20 text-success" : "bg-error/20 text-error";
    const dotBg = lastResponse.ok ? "bg-success" : "bg-error";
    const statusText = lastResponse.status === 0 ? "ERR" : String(lastResponse.status);
    const title = `${statusText} · ${lastResponse.endpoint} · ${lastResponse.latencyMs} ms · ${lastResponse.timestamp.toLocaleTimeString()}`;
    lastResponseBadge = (
      <div
        className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md ${okBg}`}
        title={title}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dotBg}`} />
        <span className="font-mono">{statusText}</span>
        <span className="opacity-70">· {lastResponse.latencyMs} ms</span>
      </div>
    );
  }

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
            <Link href="/events" className="text-muted hover:text-foreground transition-colors">
              📖 Events
            </Link>
            <Link href="/errors" className="text-muted hover:text-foreground transition-colors">
              🐞 Errors
            </Link>
            <Link href="/flags" className="text-muted hover:text-foreground transition-colors">
              🚩 Flags
            </Link>
            <Link href="/experiments" className="text-muted hover:text-foreground transition-colors">
              🧪 Experiments
            </Link>
            <Link href="/surveys" className="text-muted hover:text-foreground transition-colors">
              📝 Surveys
            </Link>
            <Link href="/event-log" className="text-muted hover:text-foreground transition-colors">
              📋 Event Log
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
        {lastResponseBadge}
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
