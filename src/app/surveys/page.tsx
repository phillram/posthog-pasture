"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Survey } from "posthog-js";
import { useAuth } from "@/contexts/AuthContext";
import { usePosthog } from "@/contexts/PosthogContext";
import Navbar from "@/components/Navbar";
import HedgehogGif from "@/components/HedgehogGif";
import SurveyCard from "@/components/SurveyCard";
import ToastStack from "@/components/ToastStack";
import { useToast } from "@/hooks/useToast";
import { surveyStatus, type SurveyStatus } from "@/lib/surveyStatus";

export default function SurveysPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const { isInitialized, captureEvent, addLog } = usePosthog();
  const router = useRouter();

  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [surveyLoading, setSurveyLoading] = useState(false);
  const [showAllStatuses, setShowAllStatuses] = useState(false);

  const { toasts, showToast } = useToast();

  const loadSurveys = async (quiet = false) => {
    setSurveyLoading(true);
    const ph = (await import("posthog-js")).default;
    ph.getSurveys((s) => {
      setSurveys(s);
      setSurveyLoading(false);
      addLog({
        type: "event",
        name: "All Surveys Loaded",
        properties: { count: s.length, surveys: s.map((sv) => sv.name) },
      });
      if (!quiet) showToast(`${s.length} survey${s.length !== 1 ? "s" : ""} loaded`);
    }, true);
  };

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Auto-load all surveys on mount once PostHog is initialized.
  useEffect(() => {
    if (!isInitialized) return;
    let cancelled = false;
    (async () => {
      const ph = (await import("posthog-js")).default;
      setSurveyLoading(true);
      ph.getSurveys((s) => {
        if (cancelled) return;
        setSurveys(s);
        setSurveyLoading(false);
        addLog({
          type: "event",
          name: "All Surveys Loaded",
          properties: { count: s.length, surveys: s.map((sv) => sv.name) },
        });
      }, true);
    })();
    return () => {
      cancelled = true;
    };
  }, [isInitialized, addLog]);

  const visibleSurveys = useMemo(() => {
    const filtered = showAllStatuses ? surveys : surveys.filter((s) => surveyStatus(s) === "running");
    // Sort by status (Running → Complete → Draft → Archived), then alphabetically within each group.
    const statusOrder: Record<SurveyStatus, number> = { running: 0, completed: 1, draft: 2, archived: 3 };
    return [...filtered].sort((a, b) => {
      const diff = statusOrder[surveyStatus(a)] - statusOrder[surveyStatus(b)];
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
  }, [surveys, showAllStatuses]);

  const statusCounts = useMemo(() => {
    const counts: Record<SurveyStatus, number> = { draft: 0, running: 0, completed: 0, archived: 0 };
    for (const s of surveys) counts[surveyStatus(s)]++;
    return counts;
  }, [surveys]);

  if (isLoading || !isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Surveys</h1>
            <p className="text-muted text-sm">Load, trigger, and respond to surveys from your PostHog project.</p>
          </div>
          <HedgehogGif index={1} size="sm" />
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
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 bg-pink-500 rounded-full" />
            <h2 className="text-lg font-semibold text-foreground">Surveys</h2>
          </div>
          <div className="bg-card border border-pink-500/30 rounded-xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3 text-xs text-muted">
                <span>
                  {statusCounts.running} running · {statusCounts.draft} draft · {statusCounts.completed} complete
                  {statusCounts.archived > 0 ? ` · ${statusCounts.archived} archived` : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAllStatuses((v) => !v)}
                  className={`py-2 px-4 font-medium rounded-lg transition-colors text-sm ${
                    showAllStatuses
                      ? "bg-pink-600 hover:bg-pink-500 text-white"
                      : "bg-pink-500/10 hover:bg-pink-500/20 text-pink-400"
                  }`}
                >
                  {showAllStatuses ? "Running Only" : "Show All Statuses"}
                </button>
                <button
                  onClick={() => loadSurveys()}
                  className="py-2 px-4 bg-pink-500/20 hover:bg-pink-500/30 text-pink-400 font-medium rounded-lg transition-colors text-sm"
                >
                  {surveyLoading ? "Loading..." : "Reload Surveys"}
                </button>
              </div>
            </div>
            {visibleSurveys.length > 0 ? (
              <div className="space-y-3">
                {visibleSurveys.map((survey) => (
                  <SurveyCard
                    key={survey.id}
                    survey={survey}
                    onTrigger={async (s) => {
                      const ph = (await import("posthog-js")).default;
                      // displaySurvey renders the branded PostHog popover modal.
                      // ignoreConditions and ignoreDelay force it to show
                      // regardless of targeting or display delay.
                      ph.displaySurvey(s.id, {
                        displayType: "popover",
                        ignoreConditions: true,
                        ignoreDelay: true,
                      });
                      addLog({
                        type: "event",
                        name: `Survey Triggered: ${s.name}`,
                        properties: { surveyId: s.id, surveyName: s.name },
                      });
                      showToast(`Survey "${s.name}" triggered`);
                    }}
                    onSubmit={(s, responses) => {
                      const payload: Record<string, unknown> = {
                        $survey_id: s.id,
                        $survey_name: s.name,
                      };
                      responses.forEach((value, idx) => {
                        payload[`$survey_response_${idx}`] = value;
                      });
                      captureEvent("survey sent", payload);
                      showToast(`Response submitted for "${s.name}"`);
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className="text-muted text-sm text-center py-4">
                {surveys.length === 0
                  ? "No surveys loaded."
                  : showAllStatuses
                    ? "No surveys to show."
                    : "No running surveys. Click \"Show All Statuses\" to see drafts and completed surveys."}
              </p>
            )}
          </div>
        </section>
      </main>

      <ToastStack toasts={toasts} />
    </div>
  );
}
