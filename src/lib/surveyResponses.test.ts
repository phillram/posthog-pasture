import { describe, expect, it } from "vitest";
import type { Survey, SurveyQuestion } from "posthog-js";
import { buildSurveySentProperties, surveyResponseKey } from "./surveyResponses";

function question(text: string, id?: string): SurveyQuestion {
  return { type: "open", question: text, ...(id ? { id } : {}) } as SurveyQuestion;
}

function survey(questions: SurveyQuestion[]): Survey {
  return { id: "survey-1", name: "Test survey", questions } as Survey;
}

describe("surveyResponseKey", () => {
  it("keys by question id, the scheme posthog-js writes", () => {
    expect(surveyResponseKey(question("How are you?", "q-abc"), 0)).toBe("$survey_response_q-abc");
  });

  it("uses a bare $survey_response for the first question without an id", () => {
    // The regression this guards: every answer used to be keyed
    // `$survey_response_<index>`, so question 1 became `$survey_response_0`.
    // PostHog reads neither that nor anything like it, and the first answer of
    // every survey was invisible in the results.
    expect(surveyResponseKey(question("First"), 0)).toBe("$survey_response");
    expect(surveyResponseKey(question("Second"), 1)).toBe("$survey_response_1");
  });
});

describe("buildSurveySentProperties", () => {
  it("carries the survey identity and the submission id", () => {
    const props = buildSurveySentProperties(survey([question("Why?", "q1")]), ["because"], "sub-1");
    expect(props).toMatchObject({
      $survey_id: "survey-1",
      $survey_name: "Test survey",
      $survey_submission_id: "sub-1",
      $survey_completed: true,
      "$survey_response_q1": "because",
    });
  });

  it("lists every question so PostHog can label the answers", () => {
    const props = buildSurveySentProperties(
      survey([question("A", "q1"), question("B", "q2")]),
      ["yes", ["one", "two"]],
      "sub-2"
    );
    expect(props.$survey_questions).toEqual([
      { id: "q1", question: "A", response: "yes" },
      { id: "q2", question: "B", response: ["one", "two"] },
    ]);
  });

  it("records an unanswered optional question as null rather than dropping it", () => {
    const props = buildSurveySentProperties(survey([question("A", "q1"), question("B", "q2")]), ["yes"], "sub-3");
    expect(props["$survey_response_q2"]).toBeNull();
  });
});
