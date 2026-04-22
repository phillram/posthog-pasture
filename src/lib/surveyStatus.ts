import type { Survey } from "posthog-js";

export type SurveyStatus = "draft" | "scheduled" | "running" | "completed";

/**
 * Derive a survey's lifecycle status from its start_date and end_date.
 *
 * - draft:      never launched (no start_date)
 * - scheduled:  start_date is set but in the future
 * - running:    start_date is in the past and no end_date (or end_date is in the future)
 * - completed:  end_date is in the past
 */
export function surveyStatus(survey: Survey): SurveyStatus {
  const now = Date.now();
  const start = survey.start_date ? Date.parse(survey.start_date) : null;
  const end = survey.end_date ? Date.parse(survey.end_date) : null;

  if (end !== null && !Number.isNaN(end) && end <= now) return "completed";
  if (start === null || Number.isNaN(start)) return "draft";
  if (start > now) return "scheduled";
  return "running";
}

export const statusBadgeClasses: Record<SurveyStatus, string> = {
  draft: "bg-muted/20 text-muted",
  scheduled: "bg-accent/20 text-accent",
  running: "bg-success/20 text-success",
  completed: "bg-warning/20 text-warning",
};

export const statusLabels: Record<SurveyStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  running: "Running",
  completed: "Completed",
};
