"use client";

import { useState, useEffect, useCallback } from "react";
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

export default function IdentifyPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const { isInitialized, identifyUser, resetPerson, setPersonProperties, groupIdentify, addLog } = usePosthog();
  const router = useRouter();
  const { toasts, showToast } = useToast();

  const [identifyId, setIdentifyId] = useState("");
  const [identifyProps, setIdentifyProps] = useState('{"plan": "premium"}');

  const [groupType, setGroupType] = useState("company");
  const [groupKey, setGroupKey] = useState("");

  const [personProps, setPersonProps] = useState('{"favorite_color": "orange"}');

  const [activeGroups, setActiveGroups] = useState<Record<string, unknown> | null>(null);

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

  useEffect(() => {
    if (isInitialized) refreshProfile();
  }, [isInitialized, refreshProfile]);

  if (isLoading || !isAuthenticated) return null;

  const handleIdentify = () => {
    if (!identifyId.trim()) return;
    let props: Record<string, unknown> | undefined;
    if (identifyProps.trim()) {
      try {
        props = JSON.parse(identifyProps);
      } catch {
        showToast("Invalid JSON in properties", "error");
        return;
      }
    }
    identifyUser(identifyId.trim(), props);
    showToast(`Identified as "${identifyId.trim()}"`);
  };

  const handleGroupIdentify = () => {
    if (!groupType.trim() || !groupKey.trim()) return;
    groupIdentify(groupType.trim(), groupKey.trim());
    showToast(`Group "${groupType.trim()}/${groupKey.trim()}" set`);
  };

  const handlePersonProps = () => {
    try {
      const props = JSON.parse(personProps);
      setPersonProperties(props);
      showToast("Person properties updated");
    } catch {
      showToast("Invalid JSON", "error");
    }
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Distinct ID</p>
                    <p className="text-sm font-mono text-foreground break-all">{profile.distinctId ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Device ID</p>
                    <p className="text-sm font-mono text-foreground break-all">{profile.deviceId ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Session ID</p>
                    <p className="text-sm font-mono text-foreground break-all">{profile.sessionId ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Status</p>
                    <p
                      className={`text-sm font-medium ${profile.isIdentified ? "text-accent" : "text-muted"}`}
                    >
                      {profile.isIdentified ? "Identified" : "Anonymous"}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Groups</p>
                  {Object.keys(profile.groups).length === 0 ? (
                    <p className="text-sm text-muted">No groups set.</p>
                  ) : (
                    <pre className="bg-input-bg border border-border rounded-lg p-3 text-xs font-mono text-foreground/80 overflow-x-auto">
                      {JSON.stringify(profile.groups, null, 2)}
                    </pre>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                    Stored properties
                  </p>
                  {Object.keys(profile.storedProperties).length === 0 ? (
                    <p className="text-sm text-muted">
                      No locally-stored properties. Person properties set via{" "}
                      <code className="bg-input-bg px-1 rounded">setPersonProperties</code> are sent to PostHog
                      and are not readable from the browser.
                    </p>
                  ) : (
                    <pre className="bg-input-bg border border-border rounded-lg p-3 text-xs font-mono text-foreground/80 overflow-x-auto">
                      {JSON.stringify(profile.storedProperties, null, 2)}
                    </pre>
                  )}
                </div>
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
                Link the current anonymous user to a distinct ID with properties.
              </p>
              <div className="space-y-3">
                <input
                  type="text"
                  value={identifyId}
                  onChange={(e) => setIdentifyId(e.target.value)}
                  placeholder="user_distinct_id"
                  className="w-full px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm font-mono"
                />
                <textarea
                  value={identifyProps}
                  onChange={(e) => setIdentifyProps(e.target.value)}
                  rows={2}
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
                    onClick={() => {
                      resetPerson();
                      showToast("Person reset", "info");
                    }}
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
                Associate the current user with a group (company, project, etc).
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
                    placeholder="Group key"
                    className="px-4 py-2.5 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm font-mono"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleGroupIdentify}
                    className="flex-1 py-2.5 px-4 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors text-sm"
                  >
                    Group Identify
                  </button>
                  <button
                    onClick={async () => {
                      const ph = (await import("posthog-js")).default;
                      const groups = ph.getGroups();
                      setActiveGroups(groups as Record<string, unknown>);
                      addLog({
                        type: "group",
                        name: "Current Groups Viewed",
                        properties: groups as Record<string, unknown>,
                      });
                      showToast(
                        Object.keys(groups).length > 0
                          ? `${Object.keys(groups).length} group(s) found`
                          : "No groups set"
                      );
                    }}
                    className="py-2.5 px-4 bg-accent/20 hover:bg-accent/30 text-accent font-medium rounded-lg transition-colors text-sm"
                    title="Show current group associations"
                  >
                    Check
                  </button>
                </div>
                {activeGroups && (
                  <div className="bg-input-bg border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-muted">Current Groups</p>
                      <button
                        onClick={() => setActiveGroups(null)}
                        className="text-xs text-muted hover:text-foreground transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                    {Object.keys(activeGroups).length > 0 ? (
                      <pre className="text-xs font-mono text-foreground/80 overflow-x-auto">
                        {JSON.stringify(activeGroups, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-xs text-muted">No groups currently set.</p>
                    )}
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
                  rows={3}
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
