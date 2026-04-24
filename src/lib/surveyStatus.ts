import type { Survey } from "posthog-js";

export type SurveyStatus = "draft" | "running" | "completed" | "archived";

/**
 * Derive a survey's lifecycle status from its start_date and end_date.
 *
 * Matches PostHog's UI statuses: Draft / Running / Complete / Archived.
 * Note: `getSurveys` does not return archived surveys, so "archived" is kept
 * for completeness but won't normally be seen.
 *
 * - completed: end_date is in the past
 * - running:   start_date is in the past and no end_date (or end_date is future)
 * - draft:     anything else (not yet started, or scheduled for future)
 */
export function surveyStatus(survey: Survey): SurveyStatus {
  const now = Date.now();
  const start = survey.start_date ? Date.parse(survey.start_date) : null;
  const end = survey.end_date ? Date.parse(survey.end_date) : null;

  if (end !== null && !Number.isNaN(end) && end <= now) return "completed";
  if (start !== null && !Number.isNaN(start) && start <= now) return "running";
  return "draft";
}

// Colours mirror the PostHog product UI: gray / green / purple / black.
export const statusBadgeClasses: Record<SurveyStatus, string> = {
  draft: "bg-muted/20 text-muted",
  running: "bg-success/20 text-success",
  completed: "bg-accent/20 text-accent",
  archived: "bg-background/60 text-muted border border-border",
};

export const statusLabels: Record<SurveyStatus, string> = {
  draft: "Draft",
  running: "Running",
  completed: "Complete",
  archived: "Archived",
};
