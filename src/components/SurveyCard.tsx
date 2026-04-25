"use client";

import { useState } from "react";
import type {
  Survey,
  SurveyQuestion,
  MultipleSurveyQuestion,
  RatingSurveyQuestion,
  LinkSurveyQuestion,
} from "posthog-js";
import { surveyStatus, statusBadgeClasses, statusLabels } from "@/lib/surveyStatus";

type ResponseValue = string | string[] | number | null;

interface Props {
  survey: Survey;
  onTrigger: (survey: Survey) => void;
  onSubmit: (survey: Survey, responses: ResponseValue[]) => void;
}

function isMultiple(q: SurveyQuestion): q is MultipleSurveyQuestion {
  return q.type === "single_choice" || q.type === "multiple_choice";
}

function isRating(q: SurveyQuestion): q is RatingSurveyQuestion {
  return q.type === "rating";
}

function isLink(q: SurveyQuestion): q is LinkSurveyQuestion {
  return q.type === "link";
}

export default function SurveyCard({ survey, onTrigger, onSubmit }: Props) {
  const [showTargeting, setShowTargeting] = useState(false);
  const [responses, setResponses] = useState<ResponseValue[]>(() => survey.questions.map(() => null));

  const setResponseAt = (idx: number, value: ResponseValue) =>
    setResponses((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });

  const handleSubmit = () => {
    onSubmit(survey, responses);
    setResponses(survey.questions.map(() => null));
  };

  const questionCount = survey.questions?.length || 0;
  const isApi = survey.type === "api";
  const status = surveyStatus(survey);
  const hasConditions =
    !!survey.conditions?.url ||
    !!survey.conditions?.selector ||
    !!survey.conditions?.events?.values?.length ||
    !!survey.linked_flag_key;

  return (
    <div className="bg-input-bg border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2 gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-foreground truncate">{survey.name}</p>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wide ${statusBadgeClasses[status]}`}>
              {statusLabels[status]}
            </span>
          </div>
          <p className="text-xs text-muted">
            {survey.type} &middot; {questionCount} question{questionCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {survey.type === "popover" && (
            <button
              onClick={() => onTrigger(survey)}
              className="py-1.5 px-3 bg-pink hover:bg-pink-hover text-white font-medium rounded-lg transition-colors text-xs"
              title="Render this survey regardless of targeting rules"
            >
              Trigger
            </button>
          )}
        </div>
      </div>

      {survey.description && <p className="text-xs text-muted mb-2">{survey.description}</p>}

      {hasConditions && (
        <div className="mb-2">
          <button
            onClick={() => setShowTargeting((v) => !v)}
            className="text-xs text-muted hover:text-foreground transition-colors"
          >
            {showTargeting ? "▾" : "▸"} Targeting conditions
          </button>
          {showTargeting && (
            <div className="mt-2 space-y-1 text-xs bg-background/50 border border-border rounded p-2 font-mono">
              {survey.conditions?.url && (
                <div>
                  <span className="text-muted">url: </span>
                  <span className="text-foreground/80">{survey.conditions.url}</span>
                  {survey.conditions.urlMatchType && (
                    <span className="text-muted"> ({survey.conditions.urlMatchType})</span>
                  )}
                </div>
              )}
              {survey.conditions?.selector && (
                <div>
                  <span className="text-muted">selector: </span>
                  <span className="text-foreground/80">{survey.conditions.selector}</span>
                </div>
              )}
              {survey.conditions?.events?.values?.length ? (
                <div>
                  <span className="text-muted">events: </span>
                  <span className="text-foreground/80">
                    {survey.conditions.events.values.map((e) => e.name).join(", ")}
                  </span>
                </div>
              ) : null}
              {survey.linked_flag_key && (
                <div>
                  <span className="text-muted">linked_flag: </span>
                  <span className="text-foreground/80">{survey.linked_flag_key}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {isApi ? (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {survey.questions.map((q, qi) => (
            <div key={q.id ?? qi} className="space-y-1.5">
              <label className="text-xs font-medium text-foreground block">
                {qi + 1}. {q.question}
                {q.optional ? <span className="text-muted"> (optional)</span> : null}
              </label>
              {q.description && <p className="text-xs text-muted">{q.description}</p>}
              {q.type === "open" && (
                <textarea
                  value={(responses[qi] as string) ?? ""}
                  onChange={(e) => setResponseAt(qi, e.target.value)}
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-pink"
                  rows={2}
                />
              )}
              {isLink(q) && (
                <a
                  href={q.link ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setResponseAt(qi, q.link ?? "")}
                  className="inline-block py-1.5 px-3 bg-pink/20 hover:bg-pink/30 text-pink text-xs rounded-lg transition-colors"
                >
                  {q.buttonText || "Open link"}
                </a>
              )}
              {isRating(q) && (
                <div className="flex gap-1">
                  {Array.from({ length: q.scale }, (_, i) => i + 1).map((n) => {
                    const selected = responses[qi] === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setResponseAt(qi, n)}
                        className={`w-8 h-8 rounded border text-xs font-medium transition-colors ${
                          selected
                            ? "bg-pink border-pink text-white"
                            : "bg-background border-border text-foreground hover:border-pink"
                        }`}
                      >
                        {q.display === "emoji"
                          ? ["😡", "😞", "😐", "🙂", "😄", "🎉", "🚀", "💖", "⭐", "🏆"][n - 1] || n
                          : n}
                      </button>
                    );
                  })}
                </div>
              )}
              {isMultiple(q) && q.type === "single_choice" && (
                <div className="space-y-1">
                  {q.choices.map((choice) => (
                    <label key={choice} className="flex items-center gap-2 text-xs text-foreground">
                      <input
                        type="radio"
                        name={`survey-${survey.id}-q-${qi}`}
                        checked={responses[qi] === choice}
                        onChange={() => setResponseAt(qi, choice)}
                      />
                      {choice}
                    </label>
                  ))}
                </div>
              )}
              {isMultiple(q) && q.type === "multiple_choice" && (
                <div className="space-y-1">
                  {q.choices.map((choice) => {
                    const current = (responses[qi] as string[] | null) ?? [];
                    const checked = current.includes(choice);
                    return (
                      <label key={choice} className="flex items-center gap-2 text-xs text-foreground">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked ? current.filter((c) => c !== choice) : [...current, choice];
                            setResponseAt(qi, next);
                          }}
                        />
                        {choice}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          <button
            onClick={handleSubmit}
            className="py-2.5 px-4 bg-pink hover:bg-pink-hover text-white font-medium rounded-lg transition-colors text-sm"
          >
            Submit response
          </button>
        </div>
      ) : (
        <details className="group">
          <summary className="text-xs text-muted cursor-pointer hover:text-foreground transition-colors">
            Questions
          </summary>
          <div className="mt-2 space-y-1.5">
            {survey.questions?.map((q, qi) => (
              <div key={q.id ?? qi} className="text-xs text-foreground/80 flex items-start gap-2">
                <span className="text-muted shrink-0">{qi + 1}.</span>
                <span>
                  {q.question} <span className="text-muted">({q.type})</span>
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
