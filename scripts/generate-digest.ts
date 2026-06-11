import fs from "node:fs";
import path from "node:path";

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

const GROUPS: Recommendation[] = ["must_read", "skim", "maybe", "ignore_for_now"];
const GROUP_HEADERS: Record<Recommendation, string> = {
  must_read: "Must Read",
  skim: "Skim",
  maybe: "Maybe",
  ignore_for_now: "Ignore For Now",
};

const root = process.cwd();

function parseArgs(): { date: string; all: boolean } {
  const args = process.argv.slice(2);
  let date = new Date().toISOString().slice(0, 10);
  let all = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--date" && args[i + 1]) {
      date = args[++i];
    } else if (args[i] === "--all") {
      all = true;
    }
  }

  return { date, all };
}

function ensureDir(dir: string) {
  fs.mkdirSync(path.join(root, dir), { recursive: true });
}

function readPapers(file: string): Paper[] {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) return [];
  return fs
    .readFileSync(fullPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function filterPapers(papers: Paper[], date: string, all: boolean): Paper[] {
  return papers.filter((p) => {
    if (!p.evaluation) return false;
    if (all) return true;
    return p.evaluation.evaluated_at.slice(0, 10) === date;
  });
}

function reportExists(id: string): boolean {
  return fs.existsSync(path.join(root, "reports", `${id}.md`));
}

function renderPaper(paper: Paper): string {
  const ev = paper.evaluation!;
  const lines: string[] = [];

  lines.push(`### [${paper.title}](${paper.arxiv_url})`);
  lines.push(``);
  lines.push(`- **Score:** ${ev.total_score}  `);
  lines.push(`- **arXiv ID:** \`${paper.id}\`  `);
  lines.push(`- **Categories:** ${paper.categories.join(", ")}  `);
  lines.push(`- **Authors:** ${paper.authors.join(", ")}  `);

  if (ev.why_read) {
    lines.push(`- **Why read:** ${ev.why_read}  `);
  }

  if (ev.key_claims && ev.key_claims.length > 0) {
    lines.push(`- **Key claims:**`);
    for (const claim of ev.key_claims) {
      lines.push(`  - ${claim}`);
    }
  }

  if (reportExists(paper.id)) {
    lines.push(`- **Report:** [reports/${paper.id}.md](../reports/${paper.id}.md)`);
  }

  return lines.join("\n");
}

function generateDigest(date: string, papers: Paper[]): string {
  const counts: Record<Recommendation, number> = {
    must_read: 0,
    skim: 0,
    maybe: 0,
    ignore_for_now: 0,
  };

  const grouped: Record<Recommendation, Paper[]> = {
    must_read: [],
    skim: [],
    maybe: [],
    ignore_for_now: [],
  };

  for (const paper of papers) {
    const rec = paper.evaluation!.recommendation;
    counts[rec]++;
    grouped[rec].push(paper);
  }

  // Sort each group by total_score descending
  for (const rec of GROUPS) {
    grouped[rec].sort(
      (a, b) => (b.evaluation!.total_score) - (a.evaluation!.total_score)
    );
  }

  const lines: string[] = [];

  lines.push(`# ArXiver Daily Digest — ${date}`);
  lines.push(``);

  if (papers.length === 0) {
    lines.push(`No evaluated papers found for ${date}.`);
    return lines.join("\n") + "\n";
  }

  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`- **Total evaluated:** ${papers.length}`);
  lines.push(`- **Must read:** ${counts.must_read}`);
  lines.push(`- **Skim:** ${counts.skim}`);
  lines.push(`- **Maybe:** ${counts.maybe}`);
  lines.push(`- **Ignore for now:** ${counts.ignore_for_now}`);
  lines.push(``);

  for (const rec of GROUPS) {
    lines.push(`## ${GROUP_HEADERS[rec]}`);
    lines.push(``);

    if (grouped[rec].length === 0) {
      lines.push(`*No papers in this category.*`);
      lines.push(``);
      continue;
    }

    for (const paper of grouped[rec]) {
      lines.push(renderPaper(paper));
      lines.push(``);
    }
  }

  lines.push(`---`);
  lines.push(`*Generated: ${new Date().toISOString()}*`);

  return lines.join("\n") + "\n";
}

function main() {
  const { date, all } = parseArgs();

  const papers = readPapers("data/papers.jsonl");
  const evaluated = filterPapers(papers, date, all);

  const label = all ? "all time" : date;
  console.log(`Found ${evaluated.length} evaluated paper(s) for ${label}.`);

  ensureDir("digests");

  const content = generateDigest(date, evaluated);
  const outPath = path.join(root, "digests", `${date}.md`);
  fs.writeFileSync(outPath, content);

  console.log(`Digest written: digests/${date}.md`);
}

main();
