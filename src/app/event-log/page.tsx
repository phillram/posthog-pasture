"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { usePosthog } from "@/contexts/PosthogContext";
import Navbar from "@/components/Navbar";
import HedgehogGif from "@/components/HedgehogGif";
import ToastStack from "@/components/ToastStack";
import { useToast } from "@/hooks/useToast";

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

const TYPE_OPTIONS = ["all", "event", "identify", "pageview", "group", "error", "config", "person", "flag", "recording"] as const;

export default function EventLogPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const { eventLog } = usePosthog();
  const router = useRouter();

  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_OPTIONS)[number]>("all");
  const [search, setSearch] = useState("");
  const { toasts, showToast } = useToast();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return eventLog.filter((entry) => {
      if (typeFilter !== "all" && entry.type !== typeFilter) return false;
      if (!q) return true;
      if (entry.name.toLowerCase().includes(q)) return true;
      if (entry.properties && JSON.stringify(entry.properties).toLowerCase().includes(q)) return true;
      return false;
    });
  }, [eventLog, typeFilter, search]);

  if (isLoading || !isAuthenticated) return null;

  const exportPayload = filtered.map((e) => ({
    id: e.id,
    timestamp: e.timestamp.toISOString(),
    type: e.type,
    name: e.name,
    properties: e.properties,
  }));

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(exportPayload, null, 2));
      showToast(`Copied ${filtered.length} entr${filtered.length === 1 ? "y" : "ies"} to clipboard`);
    } catch {
      showToast("Copy failed", "error");
    }
  };

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `pasture-event-log-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${filtered.length} entr${filtered.length === 1 ? "y" : "ies"}`);
  };

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of eventLog) counts[e.type] = (counts[e.type] ?? 0) + 1;
    return counts;
  }, [eventLog]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Event Log</h1>
            <p className="text-muted text-sm">
              All PostHog events, identifications, and actions captured during this session.
            </p>
          </div>
          <HedgehogGif index={3} size="sm" />
        </div>

        {eventLog.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <p className="text-muted text-sm">No events captured yet. Head to the Dashboard and start clicking!</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-6">
            {/* Filter / search / export toolbar */}
            <div className="flex flex-wrap items-center gap-3 mb-4 pb-4 border-b border-border">
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted font-medium">Type:</label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as (typeof TYPE_OPTIONS)[number])}
                  className="px-3 py-1.5 bg-input-bg border border-border rounded-lg text-foreground text-sm"
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t === "all" ? `All (${eventLog.length})` : `${t} (${typeCounts[t] ?? 0})`}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or properties…"
                className="flex-1 min-w-[200px] px-3 py-1.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCopyJson}
                  disabled={filtered.length === 0}
                  className="py-1.5 px-3 bg-primary/20 hover:bg-primary/30 text-primary font-medium rounded-lg transition-colors text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Copy JSON
                </button>
                <button
                  onClick={handleDownloadJson}
                  disabled={filtered.length === 0}
                  className="py-1.5 px-3 bg-primary hover:bg-primary-hover text-white font-medium rounded-lg transition-colors text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Download JSON
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
                {filtered.length} of {eventLog.length} event{eventLog.length !== 1 ? "s" : ""}
              </h2>
              {eventLog.length >= 100 && <span className="text-xs text-muted">Showing most recent 100</span>}
            </div>

            {filtered.length === 0 ? (
              <p className="text-muted text-sm text-center py-8">No entries match the current filter.</p>
            ) : (
              <div className="space-y-2">
                {filtered.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 text-sm border-b border-border/50 pb-2 animate-fade-in"
                  >
                    <span className="text-muted text-xs font-mono whitespace-nowrap mt-0.5">
                      {entry.timestamp.toLocaleTimeString()}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${typeBadgeColors[entry.type] || "bg-muted/20 text-muted"}`}
                    >
                      {entry.type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className={`font-medium ${typeColors[entry.type] || "text-foreground"}`}>{entry.name}</span>
                      {entry.properties && Object.keys(entry.properties).length > 0 && (
                        <pre className="text-xs text-muted mt-1 font-mono overflow-x-auto">
                          {JSON.stringify(entry.properties, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <ToastStack toasts={toasts} />
    </div>
  );
}
