"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { usePosthog } from "@/contexts/PosthogContext";
import Navbar from "@/components/Navbar";
import HedgehogGif from "@/components/HedgehogGif";
import ToastStack from "@/components/ToastStack";
import { useToast } from "@/hooks/useToast";

interface PosthogProfile {
  distinctId: string | null;
  deviceId: string | null;
  sessionId: string | null;
  isIdentified: boolean;
  groups: Record<string, unknown>;
  storedProperties: Record<string, unknown>;
}

const PROFILE_FIELDS: { key: keyof PosthogProfile; label: string }[] = [
  { key: "distinctId", label: "Distinct ID" },
  { key: "deviceId", label: "Device ID" },
  { key: "sessionId", label: "Session ID" },
];

function CollapsibleProfileBlock({
  title,
  data,
  emptyMessage,
}: {
  title: string;
  data: Record<string, unknown>;
  emptyMessage: ReactNode;
}) {
  const keyCount = Object.keys(data).length;
  // Auto-collapse when more than 5 rows. The user can override either way; once
  // they've toggled, we respect their choice instead of re-deriving from the data.
  const [override, setOverride] = useState<boolean | null>(null);
  const isOpen = override ?? keyCount <= 5;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOverride(!isOpen)}
        className="flex items-center gap-2 mb-2 text-left w-full hover:opacity-80 transition-opacity"
        aria-expanded={isOpen}
      >
        <span className="text-muted text-xs w-3 inline-block">{isOpen ? "▾" : "▸"}</span>
        <span className="text-xs font-semibold text-muted uppercase tracking-wide">
          {title}
          {keyCount > 0 && (
            <span className="ml-2 normal-case font-normal text-muted/70">({keyCount})</span>
          )}
        </span>
      </button>
      {isOpen && (
        keyCount === 0 ? (
          <div className="text-sm text-muted pl-5">{emptyMessage}</div>
        ) : (
          <pre className="bg-input-bg border border-border rounded-lg p-3 text-xs font-mono text-foreground/80 overflow-x-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        )
      )}
    </div>
  );
}

export default function IdentifyPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const {
    isInitialized,
    identifyUser,
    resetPerson,
    setPersonProperties,
    groupIdentify,
    lastRequestError,
    localPersonProperties,
  } = usePosthog();
  const router = useRouter();
  const { toasts, showToast } = useToast();

  const [identifyId, setIdentifyId] = useState("");

  const [groupType, setGroupType] = useState("pasture");
  const [groupKey, setGroupKey] = useState("");

  const [personProps, setPersonProps] = useState(
    '{\n    "favorite_hedgehog": "max",\n    "pasture_size": "large",\n    "spines": "9001"\n}'
  );

  const [groupError, setGroupError] = useState<{ status: number; message: string } | null>(null);
  const groupSubmitAtRef = useRef<number>(0);

  const [profile, setProfile] = useState<PosthogProfile | null>(null);

  const refreshProfile = useCallback(async () => {
    if (!isInitialized) return;
    const ph = (await import("posthog-js")).default;
    const distinctId = ph.get_distinct_id();
    const deviceId = (ph.get_property("$device_id") as string | null) ?? null;
    const sessionId = ph.get_session_id?.() ?? null;
    const groups = ph.getGroups() as Record<string, unknown>;
    // posthog.persistence.props is the local SDK store of registered super
    // properties — the closest the client has to "what PostHog knows about me"
    // without an authenticated server-side fetch. Filter out internal keys
    // (those starting with "$") so the panel reads as user-set state.
    const persistence = (ph as unknown as { persistence?: { props?: Record<string, unknown> } }).persistence;
    const allProps = persistence?.props ?? {};
    const storedProperties: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(allProps)) {
      if (!k.startsWith("$") && k !== "distinct_id") storedProperties[k] = v;
    }
    setProfile({
      distinctId,
      deviceId,
      sessionId,
      isIdentified: !!distinctId && !!deviceId && distinctId !== deviceId,
      groups,
      storedProperties,
    });
  }, [isInitialized]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // The profile comes from posthog-js, which is only available in the browser.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isInitialized) refreshProfile();
  }, [isInitialized, refreshProfile]);

  // If a request error fires within 3s of submitting Group Identify, surface
  // it inline. Other request errors (e.g. failed captures from other pages)
  // are intentionally ignored here — the event log already shows them.
  useEffect(() => {
    if (!lastRequestError) return;
    if (lastRequestError.at < groupSubmitAtRef.current) return;
    if (lastRequestError.at - groupSubmitAtRef.current > 3000) return;
    setGroupError({ status: lastRequestError.status, message: lastRequestError.message });
  }, [lastRequestError]);

  if (isLoading || !isAuthenticated) return null;

  const handleIdentify = () => {
    if (!identifyId.trim()) return;
    identifyUser(identifyId.trim());
    showToast(`Identified as "${identifyId.trim()}"`);
    refreshProfile();
  };

  const handleReset = () => {
    resetPerson();
    showToast("Person reset", "info");
    refreshProfile();
  };

  const handleGroupIdentify = () => {
    if (!groupType.trim() || !groupKey.trim()) return;
    setGroupError(null);
    groupSubmitAtRef.current = Date.now();
    groupIdentify(groupType.trim(), groupKey.trim());
    showToast(`Group "${groupType.trim()}/${groupKey.trim()}" set`);
    refreshProfile();
  };

  const handlePersonProps = () => {
    let props: Record<string, unknown>;
    try {
      props = JSON.parse(personProps);
    } catch {
      showToast("Invalid JSON", "error");
      return;
    }
    setPersonProperties(props);
    showToast("Person properties updated");
    refreshProfile();
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Identify</h1>
            <p className="text-muted text-sm">
              Identify users, set person properties, and associate them with groups.
            </p>
          </div>
          <HedgehogGif index={2} size="sm" />
        </div>

        {!isInitialized && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 text-warning text-sm">
            PostHog is not connected. Events will not be sent.{" "}
            <button onClick={() => router.push("/")} className="underline font-medium">
              Set up your API key
            </button>
          </div>
        )}

        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-1 h-6 bg-accent rounded-full" />
              <h2 className="text-lg font-semibold text-foreground">Your PostHog Profile</h2>
            </div>
            <button
              onClick={() => {
                refreshProfile();
                showToast("Profile refreshed", "info");
              }}
              disabled={!isInitialized}
              className="py-2 px-4 bg-accent/20 hover:bg-accent/30 text-accent font-medium rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              title="Re-read identity, groups, and stored properties from posthog-js"
            >
              ↻ Refresh
            </button>
          </div>
          <div className="bg-card border border-border rounded-xl p-6 space-y-5">
            {!isInitialized ? (
              <p className="text-muted text-sm">Connect PostHog to view your profile.</p>
            ) : !profile ? (
              <p className="text-muted text-sm">Loading profile…</p>
            ) : (
              <>
                <div className="space-y-2">
                  {PROFILE_FIELDS.map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-4">
                      <p className="text-xs font-semibold text-muted uppercase tracking-wide w-28 shrink-0">
                        {label}
                      </p>
                      <p className="text-sm font-mono text-foreground whitespace-nowrap overflow-x-auto flex-1">
                        {(profile[key] as string | null) ?? "—"}
                      </p>
                    </div>
                  ))}
                  <div className="flex items-center gap-4">
                    <p className="text-xs font-semibold text-muted uppercase tracking-wide w-28 shrink-0">
                      Status
                    </p>
                    <p
                      className={`text-sm font-medium ${profile.isIdentified ? "text-accent" : "text-muted"}`}
                    >
                      {profile.isIdentified ? "Identified" : "Anonymous"}
                    </p>
                  </div>
                </div>

                <CollapsibleProfileBlock
                  title="Groups"
                  data={profile.groups}
                  emptyMessage="No groups set."
                />

                <CollapsibleProfileBlock
                  title="Person properties"
                  data={localPersonProperties}
                  emptyMessage={
                    <>
                      None set yet. Use the <span className="font-semibold">Person Properties</span> card
                      below to send some.
                    </>
                  }
                />

                <CollapsibleProfileBlock
                  title="Stored super properties"
                  data={profile.storedProperties}
                  emptyMessage={
                    <>
                      No super properties registered. These are set via{" "}
                      <code className="bg-input-bg px-1 rounded">register</code> on the Events page.
                    </>
                  }
                />
              </>
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 bg-accent rounded-full" />
            <h2 className="text-lg font-semibold text-foreground">People & Groups</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Identify User */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="text-base font-semibold text-foreground mb-3">Identify User</h3>
              <p className="text-muted text-xs mb-3">
                Link the current anonymous user to a distinct ID. Use the Person Properties card to attach
                properties.
              </p>
              <div className="space-y-3">
                <input
                  type="text"
                  value={identifyId}
                  onChange={(e) => setIdentifyId(e.target.value)}
                  placeholder="hoglet"
                  className="w-full px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm font-mono"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleIdentify}
                    className="flex-1 py-2.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors text-sm"
                  >
                    Identify
                  </button>
                  <button
                    onClick={handleReset}
                    className="py-2.5 px-4 bg-error/20 hover:bg-error/30 text-error font-medium rounded-lg transition-colors text-sm"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>

            {/* Group Identify */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="text-base font-semibold text-foreground mb-3">Group Identify</h3>
              <p className="text-muted text-xs mb-3">
                Associate the current user with a group (e.g. pasture or company).
              </p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={groupType}
                    onChange={(e) => setGroupType(e.target.value)}
                    placeholder="Group type"
                    className="px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm font-mono"
                  />
                  <input
                    type="text"
                    value={groupKey}
                    onChange={(e) => setGroupKey(e.target.value)}
                    placeholder="sunny_meadow"
                    className="px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm font-mono"
                  />
                </div>
                <button
                  onClick={handleGroupIdentify}
                  className="w-full py-2.5 px-4 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors text-sm"
                >
                  Group Identify
                </button>
                {groupError && (
                  <div className="bg-error/10 border border-error/30 rounded-lg p-3 text-error text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold mb-1">
                          Group identify failed{groupError.status ? ` (${groupError.status})` : ""}
                        </p>
                        <p className="font-mono break-words">{groupError.message}</p>
                        <p className="text-error/80 mt-2">
                          Group analytics may not be available on your current PostHog plan.
                        </p>
                      </div>
                      <button
                        onClick={() => setGroupError(null)}
                        className="text-error/70 hover:text-error transition-colors shrink-0"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Person Properties */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="text-base font-semibold text-foreground mb-3">Person Properties</h3>
              <p className="text-muted text-xs mb-3">
                Set properties on the current person without needing to re-identify.
              </p>
              <div className="space-y-3">
                <textarea
                  value={personProps}
                  onChange={(e) => setPersonProps(e.target.value)}
                  rows={6}
                  className="w-full px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm font-mono"
                />
                <button
                  onClick={handlePersonProps}
                  className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors text-sm"
                >
                  Set Person Properties
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <ToastStack toasts={toasts} />
    </div>
  );
}
