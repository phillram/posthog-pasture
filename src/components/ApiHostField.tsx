"use client";

import { useState } from "react";

export const US_CLOUD_HOST = "https://us.i.posthog.com";
export const EU_CLOUD_HOST = "https://eu.i.posthog.com";

const PRESETS = [
  { value: US_CLOUD_HOST, label: "US Cloud (us.i.posthog.com)" },
  { value: EU_CLOUD_HOST, label: "EU Cloud (eu.i.posthog.com)" },
];

const CUSTOM = "__custom__";

interface Props {
  value: string;
  onChange: (host: string) => void;
}

/**
 * Host picker for the two PostHog Clouds, plus a free text field for a
 * self-hosted instance, a reverse proxy, or a local dev server.
 */
export default function ApiHostField({ value, onChange }: Props) {
  const matchesPreset = PRESETS.some((p) => p.value === value);
  const [isCustom, setIsCustom] = useState(!matchesPreset && value !== "");

  const selected = isCustom ? CUSTOM : value;

  return (
    <div>
      <label htmlFor="api-host-preset" className="block text-sm font-medium text-foreground mb-2">
        API host
      </label>
      <select
        id="api-host-preset"
        value={selected}
        onChange={(e) => {
          if (e.target.value === CUSTOM) {
            setIsCustom(true);
            return;
          }
          setIsCustom(false);
          onChange(e.target.value);
        }}
        className="w-full px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
      >
        {PRESETS.map((preset) => (
          <option key={preset.value} value={preset.value}>
            {preset.label}
          </option>
        ))}
        <option value={CUSTOM}>Self-hosted, proxy, or local</option>
      </select>
      {isCustom && (
        <>
          <input
            type="url"
            aria-label="Custom API host"
            value={matchesPreset ? "" : value}
            onChange={(e) => onChange(e.target.value.trim().replace(/\/+$/, ""))}
            placeholder="https://posthog.example.com"
            className="w-full mt-2 px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary text-sm font-mono"
          />
          <p className="text-xs text-muted mt-2">
            Use the ingestion host, not the app host. A reverse proxy in front of PostHog also works, and it keeps ad
            blockers from dropping the requests.
          </p>
        </>
      )}
    </div>
  );
}
