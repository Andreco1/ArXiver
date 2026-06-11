import fs from "node:fs";
import path from "node:path";

export type Recommendation = "must_read" | "skim" | "maybe" | "ignore_for_now";

export type Status =
  | "new"
  | "recommended"
  | "queued"
  | "reading"
  | "read"
  | "archived"
  | "dismissed";

export type Scores = {
  novelty: number;
  open_problem_fit: number;
  methodological_relevance: number;
  result_importance: number;
  readability: number;
};

export type Evaluation = {
  paper_id: string;
  basis: string;
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

export type Paper = {
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
  status: Status;
  created_at: string;
  updated_local_at: string;
  evaluation?: Evaluation;
};

function root(): string {
  return process.cwd();
}

export function normalizeId(id: string): string {
  return id.replace(/v\d+$/, "");
}

export function readPapers(): Map<string, Paper> {
  const fullPath = path.join(root(), "data/papers.jsonl");
  if (!fs.existsSync(fullPath)) return new Map();
  const rows = fs
    .readFileSync(fullPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Paper);
  return new Map(rows.map((p) => [p.id, p]));
}

export function writeJsonlAtomic(papers: Map<string, Paper>): void {
  const fullPath = path.join(root(), "data/papers.jsonl");
  const tmp = fullPath + ".tmp";
  const rows = Array.from(papers.values()).sort((a, b) =>
    b.published_at.localeCompare(a.published_at)
  );
  fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.renameSync(tmp, fullPath);
}

export function findPaper(
  papers: Map<string, Paper>,
  rawId: string
): Paper | null {
  if (papers.has(rawId)) return papers.get(rawId)!;
  const needle = normalizeId(rawId);
  for (const [storedId, paper] of papers) {
    if (normalizeId(storedId) === needle) return paper;
  }
  return null;
}
