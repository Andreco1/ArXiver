import fs from "node:fs";
import path from "node:path";

type Recommendation = "must_read" | "skim" | "maybe" | "ignore_for_now";

type Status =
  | "new"
  | "recommended"
  | "queued"
  | "reading"
  | "read"
  | "archived"
  | "dismissed";

type Evaluation = {
  total_score: number;
  recommendation: Recommendation;
  [key: string]: unknown;
};

type Paper = {
  id: string;
  title: string;
  authors: string[];
  categories: string[];
  published_at: string;
  arxiv_url: string;
  status: Status;
  updated_local_at: string;
  evaluation?: Evaluation;
  [key: string]: unknown;
};

const ALLOWED_STATUSES: Status[] = [
  "new",
  "recommended",
  "queued",
  "reading",
  "read",
  "archived",
  "dismissed",
];

const root = process.cwd();

// Strip trailing version suffix: "2606.12345v1" -> "2606.12345"
function normalizeId(id: string): string {
  return id.replace(/v\d+$/, "");
}

function readPapers(): Map<string, Paper> {
  const fullPath = path.join(root, "data/papers.jsonl");
  if (!fs.existsSync(fullPath)) return new Map();
  const rows = fs
    .readFileSync(fullPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Paper);
  return new Map(rows.map((p) => [p.id, p]));
}

function writeJsonlAtomic(papers: Map<string, Paper>) {
  const fullPath = path.join(root, "data/papers.jsonl");
  const tmp = fullPath + ".tmp";
  const rows = Array.from(papers.values()).sort((a, b) =>
    b.published_at.localeCompare(a.published_at)
  );
  fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.renameSync(tmp, fullPath);
}

function findPaper(papers: Map<string, Paper>, rawId: string): Paper | null {
  // Exact match first
  if (papers.has(rawId)) return papers.get(rawId)!;
  // Normalized match: try stripping version from stored IDs
  const needle = normalizeId(rawId);
  for (const [storedId, paper] of papers) {
    if (normalizeId(storedId) === needle) return paper;
  }
  return null;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function formatRec(rec: Recommendation | undefined): string {
  if (!rec) return "—";
  return rec.replace(/_/g, " ");
}

function printTable(rows: Paper[]) {
  if (rows.length === 0) {
    console.log("No papers found.");
    return;
  }

  const header = `${"SCORE".padEnd(6)}  ${"RECOMMENDATION".padEnd(17)}  ${"STATUS".padEnd(10)}  ${"ARXIV ID".padEnd(18)}  TITLE`;
  const sep = "─".repeat(header.length);
  console.log(sep);
  console.log(header);
  console.log(sep);

  for (const p of rows) {
    const score = p.evaluation ? p.evaluation.total_score.toFixed(2) : "  —  ";
    const rec = formatRec(p.evaluation?.recommendation);
    const line = [
      score.padEnd(6),
      rec.padEnd(17),
      p.status.padEnd(10),
      p.id.padEnd(18),
      truncate(p.title, 60),
    ].join("  ");
    console.log(line);
  }

  console.log(sep);
  console.log(`${rows.length} paper(s)`);
}

function cmdList(
  papers: Map<string, Paper>,
  args: string[]
) {
  let filterStatus: Status | null = null;
  let filterRec: Recommendation | null = null;
  let limit = Infinity;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--status" && args[i + 1]) {
      filterStatus = args[++i] as Status;
      if (!ALLOWED_STATUSES.includes(filterStatus)) {
        console.error(`Unknown status: "${filterStatus}". Allowed: ${ALLOWED_STATUSES.join(", ")}`);
        process.exit(1);
      }
    } else if (args[i] === "--recommendation" && args[i + 1]) {
      filterRec = args[++i] as Recommendation;
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[++i], 10);
    }
  }

  let rows = Array.from(papers.values());

  if (filterStatus) {
    rows = rows.filter((p) => p.status === filterStatus);
  } else {
    // Default: evaluated papers only
    rows = rows.filter((p) => p.evaluation);
  }

  if (filterRec) {
    rows = rows.filter((p) => p.evaluation?.recommendation === filterRec);
  }

  // Sort by score desc, then published_at desc
  rows.sort((a, b) => {
    const sa = a.evaluation?.total_score ?? -1;
    const sb = b.evaluation?.total_score ?? -1;
    if (sb !== sa) return sb - sa;
    return b.published_at.localeCompare(a.published_at);
  });

  if (limit < Infinity) rows = rows.slice(0, limit);

  printTable(rows);
}

function cmdSetStatus(
  papers: Map<string, Paper>,
  rawId: string,
  newStatus: Status
) {
  const paper = findPaper(papers, rawId);
  if (!paper) {
    console.error(`Paper not found: "${rawId}"`);
    process.exit(1);
  }

  const prev = paper.status;
  paper.status = newStatus;
  paper.updated_local_at = new Date().toISOString();
  papers.set(paper.id, paper);

  writeJsonlAtomic(papers);
  console.log(`${paper.id}: ${prev} → ${newStatus}`);
  console.log(`Title: ${paper.title}`);
}

function usage() {
  console.log(`
ArXiver Queue Manager

Usage:
  npx tsx scripts/manage-queue.ts list [--status <status>] [--recommendation <rec>] [--limit N]
  npx tsx scripts/manage-queue.ts queue <arxiv-id>
  npx tsx scripts/manage-queue.ts reading <arxiv-id>
  npx tsx scripts/manage-queue.ts read <arxiv-id>
  npx tsx scripts/manage-queue.ts archive <arxiv-id>
  npx tsx scripts/manage-queue.ts dismiss <arxiv-id>

Statuses: new | recommended | queued | reading | read | archived | dismissed
`.trim());
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  if (!cmd || cmd === "--help" || cmd === "-h") {
    usage();
    return;
  }

  const papers = readPapers();

  if (cmd === "list") {
    cmdList(papers, rest);
    return;
  }

  const statusCommands: Record<string, Status> = {
    queue: "queued",
    reading: "reading",
    read: "read",
    archive: "archived",
    dismiss: "dismissed",
  };

  if (statusCommands[cmd]) {
    const rawId = rest[0];
    if (!rawId) {
      console.error(`Usage: manage-queue.ts ${cmd} <arxiv-id>`);
      process.exit(1);
    }
    cmdSetStatus(papers, rawId, statusCommands[cmd]);
    return;
  }

  console.error(`Unknown command: "${cmd}"`);
  usage();
  process.exit(1);
}

main();
