import test from "node:test";
import assert from "node:assert/strict";
import {
  clampScore,
  computeTotal,
  deriveRecommendation,
  validateEvaluation,
} from "../scripts/lib/evaluation.js";

test("clampScore rounds and clamps to the configured range", () => {
  assert.equal(clampScore(3.6, 1, 5), 4);
  assert.equal(clampScore(0, 1, 5), 1);
  assert.equal(clampScore(8, 1, 5), 5);
});

test("computeTotal applies weights and rounds to two decimals", () => {
  const total = computeTotal(
    {
      novelty: 5,
      open_problem_fit: 4,
      methodological_relevance: 3,
      result_importance: 2,
      readability: 1,
    },
    {
      novelty: 0.25,
      open_problem_fit: 0.35,
      methodological_relevance: 0.25,
      result_importance: 0.1,
      readability: 0.05,
    }
  );

  assert.equal(total, 3.65);
});

test("deriveRecommendation respects configured thresholds", () => {
  const thresholds = {
    must_read: 4.3,
    skim: 3.6,
    maybe: 3.0,
    ignore_for_now: 0,
  };

  assert.equal(deriveRecommendation(4.3, thresholds), "must_read");
  assert.equal(deriveRecommendation(3.6, thresholds), "skim");
  assert.equal(deriveRecommendation(3.0, thresholds), "maybe");
  assert.equal(deriveRecommendation(2.9, thresholds), "ignore_for_now");
});

test("validateEvaluation accepts the abstract-only contract", () => {
  const error = validateEvaluation({
    basis: "metadata_and_abstract",
    scores: {
      novelty: 4,
      open_problem_fit: 5,
      methodological_relevance: 3,
      result_importance: 4,
      readability: 2,
    },
    rationale: "The abstract supports this evaluation.",
    key_claims: ["A claim"],
    why_read: "Relevant.",
    why_skip: "May be narrow.",
  });

  assert.equal(error, null);
});

test("validateEvaluation rejects missing score dimensions", () => {
  const error = validateEvaluation({
    basis: "metadata_and_abstract",
    scores: {
      novelty: 4,
    },
    rationale: "Incomplete.",
    key_claims: [],
    why_read: "",
    why_skip: "",
  });

  assert.match(error ?? "", /scores.open_problem_fit/);
});
