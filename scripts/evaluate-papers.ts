import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import YAML from "yaml";
import {
  SCORE_DIMS,
  clampScore,
  computeTotal,
  deriveRecommendation,
  validateEvaluation,
} from "./lib/evaluation.js";

type Paper = {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  categories: string[];
  primary_category: string;
  published_at: string;
  updated_at: string;
  arxiv_url: string;
  pdf_url: string;
  status: string;
  created_at: string;
  updated_local_at: string;
  evaluation?: Evaluation;
};

type Scores = {
  novelty: number;
  open_problem_fit: number;
  methodological_relevance: number;
  result_importance: number;
  readability: number;
};

type Recommendation = "must_read" | "skim" | "maybe" | "ignore_for_now";

type Evaluation = {
  paper_id: string;
  basis: "metadata_and_abstract";
  scores: Scores;
  total_score: number;
  recommendation: Recommendation;
  rationale: string;
  key_claims: string[];
  why_read: string;
  why_skip: string;
  suggested_first_read: string[];
  evaluated_at: string;
};

const root = process.cwd();

function readYaml(file: string): any {
  return YAML.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function ensureDir(dir: string) {
  fs.mkdirSync(path.join(root, dir), { recursive: true });
}

function readExistingPapers(file: string): Map<string, Paper> {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) return new Map();
  const rows = fs
    .readFileSync(fullPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return new Map(rows.map((paper) => [paper.id, paper]));
}

function writeJsonlAtomic(file: string, rows: any[]) {
  const fullPath = path.join(root, file);
  const tmp = fullPath + ".tmp";
  fs.writeFileSync(tmp, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  fs.renameSync(tmp, fullPath);
}

function callClaude(prompt: string): string {
  return execSync("claude -p", {
    input: prompt,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function parseArgs(): { limit: number; dryRun: boolean } {
  const args = process.argv.slice(2);
  let limit = 5;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[++i], 10);
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  return { limit, dryRun };
}

function buildPrompt(paper: Paper, profile: any, scoring: any): string {
  const interests = [
    ...(profile.research_interests?.primary ?? []),
    ...(profile.research_interests?.secondary ?? []),
  ].join("; ");

  const openProblems = (profile.open_problems ?? [])
    .map((p: any) => `  - ${p.title}: ${p.description}`)
    .join("\n");

  const methods = (profile.methods_of_interest ?? []).join(", ");

  const dims = SCORE_DIMS.map(
    (k) => `  - ${k} (weight ${scoring.weights[k]}): ${scoring.dimensions[k]}`
  ).join("\n");

  return `You are a rigorous paper evaluator for an academic researcher.

## Researcher Profile
Field: ${profile.researcher?.field ?? ""}
Research interests: ${interests}
Open problems:
${openProblems}
Methods of interest: ${methods}
Notes: ${profile.notes?.trim() ?? ""}

## Scoring Dimensions (integers ${scoring.scale.min}–${scoring.scale.max})
${dims}

## Paper

Title: ${paper.title}
Authors: ${paper.authors.join(", ")}
Categories: ${paper.categories.join(", ")}
Abstract:
${paper.abstract}

## Instructions

Evaluate this paper using ONLY the abstract and metadata above. Do not claim to have read the full PDF.

Return ONLY a valid JSON object — no markdown fences, no prose outside the JSON:

{
  "paper_id": "${paper.id}",
  "basis": "metadata_and_abstract",
  "scores": {
    "novelty": <integer ${scoring.scale.min}–${scoring.scale.max}>,
    "open_problem_fit": <integer ${scoring.scale.min}–${scoring.scale.max}>,
    "methodological_relevance": <integer ${scoring.scale.min}–${scoring.scale.max}>,
    "result_importance": <integer ${scoring.scale.min}–${scoring.scale.max}>,
    "readability": <integer ${scoring.scale.min}–${scoring.scale.max}>
  },
  "total_score": 0,
  "recommendation": "<must_read|skim|maybe|ignore_for_now>",
  "rationale": "<2–4 sentences citing specific phrases from the abstract>",
  "key_claims": ["<claim from abstract>"],
  "why_read": "<one sentence>",
  "why_skip": "<one sentence>",
  "suggested_first_read": []
}

Rules:
- Scores must be integers.
- Quote or paraphrase specific abstract text as evidence.
- If evidence for a dimension is weak, say so in rationale.
- Do not mention equations unless they appear in the abstract.
- Leave total_score as 0; it will be recomputed.`;
}

function writeReport(paper: Paper, ev: Evaluation): void {
  const lines = [
    `# ${paper.title}`,
    ``,
    `**arXiv:** [${paper.id}](${paper.arxiv_url})  `,
    `**Authors:** ${paper.authors.join(", ")}  `,
    `**Categories:** ${paper.categories.join(", ")}  `,
    `**Published:** ${paper.published_at}  `,
    `**Basis: metadata and abstract only.**`,
    ``,
    `## Scores`,
    ``,
    `| Dimension | Score |`,
    `|-----------|-------|`,
    `| Novelty | ${ev.scores.novelty} |`,
    `| Open Problem Fit | ${ev.scores.open_problem_fit} |`,
    `| Methodological Relevance | ${ev.scores.methodological_relevance} |`,
    `| Result Importance | ${ev.scores.result_importance} |`,
    `| Readability | ${ev.scores.readability} |`,
    `| **Total** | **${ev.total_score}** |`,
    ``,
    `**Recommendation:** \`${ev.recommendation}\``,
    ``,
    `## Rationale`,
    ``,
    ev.rationale,
    ``,
    `## Key Claims`,
    ``,
    ...(ev.key_claims.length > 0
      ? ev.key_claims.map((c) => `- ${c}`)
      : ["- (none identified from abstract)"]),
    ``,
    `## Why Read`,
    ``,
    ev.why_read || "—",
    ``,
    `## Why Skip`,
    ``,
    ev.why_skip || "—",
    ``,
    `---`,
    `*Evaluated at: ${ev.evaluated_at}*`,
  ];

  fs.writeFileSync(
    path.join(root, "reports", `${paper.id}.md`),
    lines.join("\n") + "\n"
  );
}

async function main() {
  const { limit, dryRun } = parseArgs();
  const profile = readYaml("config/profile.yml");
  const scoring = readYaml("config/scoring.yml");

  const existing = readExistingPapers("data/papers.jsonl");
  const candidates = Array.from(existing.values()).filter(
    (p) => p.status === "new" && !p.evaluation
  );

  const toEvaluate = candidates.slice(0, limit);

  if (toEvaluate.length === 0) {
    console.log("No papers to evaluate (no new papers without an evaluation).");
    return;
  }

  console.log(
    `Found ${candidates.length} candidate(s). Evaluating ${toEvaluate.length}${dryRun ? " (dry run)" : ""}...`
  );

  if (dryRun) {
    for (const paper of toEvaluate) {
      console.log(`  [dry-run] ${paper.id} — ${paper.title}`);
    }
    return;
  }

  ensureDir("reports");

  let evaluated = 0;

  for (const paper of toEvaluate) {
    console.log(`\nEvaluating ${paper.id}: ${paper.title}`);
    try {
      const prompt = buildPrompt(paper, profile, scoring);
      const raw = callClaude(prompt);

      // Strip optional markdown code fences the model may add
      const jsonText = raw
        .replace(/^```(?:json)?\s*/m, "")
        .replace(/\s*```\s*$/m, "")
        .trim();

      let parsed: any;
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        throw new Error(`Model returned non-JSON output:\n${raw.slice(0, 400)}`);
      }

      const validationError = validateEvaluation(parsed);
      if (validationError) {
        throw new Error(`Evaluation failed validation: ${validationError}`);
      }

      // Clamp scores to configured scale
      for (const dim of SCORE_DIMS) {
        parsed.scores[dim] = clampScore(
          parsed.scores[dim],
          scoring.scale.min,
          scoring.scale.max
        );
      }

      // Compute total and recommendation locally — never trust the model's values
      const total = computeTotal(parsed.scores, scoring.weights);
      const recommendation = deriveRecommendation(total, scoring.thresholds);

      const evaluation: Evaluation = {
        paper_id: paper.id,
        basis: "metadata_and_abstract",
        scores: parsed.scores,
        total_score: total,
        recommendation,
        rationale: parsed.rationale,
        key_claims: parsed.key_claims,
        why_read: parsed.why_read,
        why_skip: parsed.why_skip,
        suggested_first_read: parsed.suggested_first_read ?? [],
        evaluated_at: new Date().toISOString(),
      };

      writeReport(paper, evaluation);
      console.log(`  Score: ${total} → ${recommendation}`);
      console.log(`  Report: reports/${paper.id}.md`);

      existing.set(paper.id, {
        ...paper,
        evaluation,
        updated_local_at: new Date().toISOString(),
      });

      evaluated++;
    } catch (err) {
      console.error(`  [error] ${paper.id}:`, (err as Error).message);
    }
  }

  // Atomic write — preserve sort order
  const rows = Array.from(existing.values()).sort((a, b) =>
    b.published_at.localeCompare(a.published_at)
  );
  writeJsonlAtomic("data/papers.jsonl", rows);

  console.log(`\nDone. Evaluated ${evaluated}/${toEvaluate.length} paper(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
