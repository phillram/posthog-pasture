"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { usePosthog } from "@/contexts/PosthogContext";
import Navbar from "@/components/Navbar";

const typeColors: Record<string, string> = {
  event: "text-primary",
  identify: "text-accent",
  pageview: "text-success",
  group: "text-warning",
  error: "text-error",
  config: "text-muted",
  person: "text-accent",
  flag: "text-warning",
  recording: "text-success",
};

const typeBadgeColors: Record<string, string> = {
  event: "bg-primary/20 text-primary",
  identify: "bg-accent/20 text-accent",
  pageview: "bg-success/20 text-success",
  group: "bg-warning/20 text-warning",
  error: "bg-error/20 text-error",
  config: "bg-muted/20 text-muted",
  person: "bg-accent/20 text-accent",
  flag: "bg-warning/20 text-warning",
  recording: "bg-success/20 text-success",
};

export default function EventLogPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const { eventLog } = usePosthog();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">📋 Event Log</h1>
          <p className="text-muted text-sm">
            All PostHog events, identifications, and actions captured during this session.
          </p>
        </div>

        {eventLog.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <p className="text-muted text-sm">No events captured yet. Head to the Dashboard and start clicking!</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
                {eventLog.length} event{eventLog.length !== 1 ? "s" : ""} captured
              </h2>
              {eventLog.length >= 100 && (
                <span className="text-xs text-muted">Showing most recent 100</span>
              )}
            </div>
            <div className="space-y-2">
              {eventLog.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 text-sm border-b border-border/50 pb-2 animate-fade-in">
                  <span className="text-muted text-xs font-mono whitespace-nowrap mt-0.5">
                    {entry.timestamp.toLocaleTimeString()}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${typeBadgeColors[entry.type] || "bg-muted/20 text-muted"}`}>
                    {entry.type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className={`font-medium ${typeColors[entry.type] || "text-foreground"}`}>
                      {entry.name}
                    </span>
                    {entry.properties && Object.keys(entry.properties).length > 0 && (
                      <pre className="text-xs text-muted mt-1 font-mono overflow-x-auto">
                        {JSON.stringify(entry.properties, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
