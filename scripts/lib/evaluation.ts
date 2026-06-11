import type { Recommendation, Scores } from "./papers.js";

export const SCORE_DIMS = [
  "novelty",
  "open_problem_fit",
  "methodological_relevance",
  "result_importance",
  "readability",
] as const;

export function clampScore(score: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(score)));
}

export function computeTotal(
  scores: Scores,
  weights: Partial<Record<keyof Scores, number>>
): number {
  let total = 0;
  for (const [dim, weight] of Object.entries(weights)) {
    total += (scores[dim as keyof Scores] ?? 1) * Number(weight);
  }
  return Math.round(total * 100) / 100;
}

export function deriveRecommendation(
  total: number,
  thresholds: Record<Recommendation, number>
): Recommendation {
  if (total >= thresholds.must_read) return "must_read";
  if (total >= thresholds.skim) return "skim";
  if (total >= thresholds.maybe) return "maybe";
  return "ignore_for_now";
}

export function validateEvaluation(obj: any): string | null {
  if (obj.basis !== "metadata_and_abstract") {
    return `basis must be "metadata_and_abstract", got "${obj.basis}"`;
  }
  if (!obj.scores || typeof obj.scores !== "object") {
    return "missing scores object";
  }
  for (const dim of SCORE_DIMS) {
    if (typeof obj.scores[dim] !== "number") {
      return `scores.${dim} is not a number`;
    }
  }
  if (typeof obj.rationale !== "string") return "rationale must be a string";
  if (!Array.isArray(obj.key_claims)) return "key_claims must be an array";
  if (typeof obj.why_read !== "string") return "why_read must be a string";
  if (typeof obj.why_skip !== "string") return "why_skip must be a string";
  return null;
}
