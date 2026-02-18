"use client";

import { usePosthog } from "@/contexts/PosthogContext";

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

export default function EventLog() {
  const { eventLog } = usePosthog();

  if (eventLog.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Event Log</h3>
        <p className="text-muted text-sm">No events captured yet. Start clicking buttons above!</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
        Event Log ({eventLog.length})
      </h3>
      <div className="space-y-2 max-h-96 overflow-y-auto">
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
  );
}
