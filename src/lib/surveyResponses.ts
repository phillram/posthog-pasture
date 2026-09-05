// Payload shape for a "survey sent" event.
//
// The Surveys page used to key every answer as `$survey_response_<index>`, so
// the first question became `$survey_response_0`. PostHog reads neither that
// nor anything like it, and the first answer of every survey was invisible in
// the results. posthog-js keys an answer by the question ID, and falls back to
// the older index scheme where the first question is a bare `$survey_response`.

import type { Survey, SurveyQuestion } from "posthog-js";

export type SurveyResponseValue = string | string[] | number | null;

/**
 * The property name PostHog reads for one question's answer.
 *
 * A question ID is the current scheme and the one posthog-js writes. Question
 * IDs are optional in the SDK types, so the index scheme stays as the fallback:
 * a bare `$survey_response` for the first question, then `$survey_response_1`
 * and up.
 */
export function surveyResponseKey(question: SurveyQuestion, index: number): string {
  if (question.id) return `$survey_response_${question.id}`;
  return index === 0 ? "$survey_response" : `$survey_response_${index}`;
}

/**
 * Build the properties for a `survey sent` event, in the shape posthog-js
 * sends when it renders the survey itself.
 */
export function buildSurveySentProperties(
  survey: Survey,
  responses: SurveyResponseValue[],
  submissionId: string
): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    $survey_id: survey.id,
    $survey_name: survey.name,
    $survey_submission_id: submissionId,
    $survey_completed: true,
    // PostHog reads this to label the answers in the results view.
    $survey_questions: survey.questions.map((question, index) => ({
      id: question.id,
      question: question.question,
      response: responses[index] ?? null,
    })),
  };

  survey.questions.forEach((question, index) => {
    properties[surveyResponseKey(question, index)] = responses[index] ?? null;
  });

  return properties;
}

/**
 * Properties for the `survey shown` event that has to precede `survey sent`.
 * Without it PostHog reads the survey's shown-to-sent rate as 0%.
 */
export function buildSurveyShownProperties(survey: Survey, submissionId: string): Record<string, unknown> {
  return {
    $survey_id: survey.id,
    $survey_name: survey.name,
    $survey_submission_id: submissionId,
  };
}
