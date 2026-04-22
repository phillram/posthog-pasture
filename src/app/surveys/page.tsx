"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Survey } from "posthog-js";
import { useAuth } from "@/contexts/AuthContext";
import { usePosthog } from "@/contexts/PosthogContext";
import Navbar from "@/components/Navbar";
import HedgehogGif from "@/components/HedgehogGif";
import SurveyCard from "@/components/SurveyCard";
import ToastStack from "@/components/ToastStack";
import { useToast } from "@/hooks/useToast";

export default function SurveysPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const { isInitialized, captureEvent, addLog } = usePosthog();
  const router = useRouter();

  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [surveyLoading, setSurveyLoading] = useState(false);

  const { toasts, showToast } = useToast();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Auto-load all surveys on mount once PostHog is initialized.
  useEffect(() => {
    if (!isInitialized) return;
    let cancelled = false;
    setSurveyLoading(true);
    (async () => {
      const ph = (await import("posthog-js")).default;
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

  if (isLoading || !isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Surveys</h1>
            <p className="text-muted text-sm">Load, preview, and respond to surveys from your PostHog project.</p>
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
            <div className="flex items-center justify-between mb-4">
              <p className="text-muted text-xs">Load and trigger surveys from your PostHog project.</p>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
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
                      showToast(`${s.length} survey${s.length !== 1 ? "s" : ""} loaded`);
                    }, true);
                  }}
                  className="py-2 px-4 bg-pink-500/20 hover:bg-pink-500/30 text-pink-400 font-medium rounded-lg transition-colors text-sm"
                >
                  {surveyLoading ? "Loading..." : "Reload Surveys"}
                </button>
                <button
                  onClick={async () => {
                    setSurveyLoading(true);
                    const ph = (await import("posthog-js")).default;
                    ph.getActiveMatchingSurveys((s) => {
                      setSurveys(s);
                      setSurveyLoading(false);
                      addLog({
                        type: "event",
                        name: "Matching Surveys Loaded",
                        properties: { count: s.length, surveys: s.map((sv) => sv.name) },
                      });
                      showToast(`${s.length} matching survey${s.length !== 1 ? "s" : ""} loaded`);
                    }, true);
                  }}
                  className="py-2 px-4 bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 font-medium rounded-lg transition-colors text-sm"
                >
                  Matching Only
                </button>
              </div>
            </div>
            {surveys.length > 0 ? (
              <div className="space-y-3">
                {surveys.map((survey) => (
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
                    onDismiss={(s) => {
                      captureEvent("survey dismissed", {
                        $survey_id: s.id,
                        $survey_name: s.name,
                      });
                      showToast(`Dismissed "${s.name}"`, "info");
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className="text-muted text-sm text-center py-4">
                No surveys loaded. Click &quot;Load Surveys&quot; to fetch active surveys.
              </p>
            )}
          </div>
        </section>
      </main>

      <ToastStack toasts={toasts} />
    </div>
  );
}
