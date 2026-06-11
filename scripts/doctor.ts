import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import YAML from "yaml";

type CheckLevel = "ok" | "warn" | "fail";

type Check = {
  level: CheckLevel;
  label: string;
  detail?: string;
};

const root = process.cwd();
const checks: Check[] = [];

function add(level: CheckLevel, label: string, detail?: string) {
  checks.push({ level, label, detail });
}

function exists(relPath: string): boolean {
  return fs.existsSync(path.join(root, relPath));
}

function readText(relPath: string): string {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

function readYaml(relPath: string): any | null {
  try {
    return YAML.parse(readText(relPath));
  } catch (err: any) {
    add("fail", `${relPath} is valid YAML`, err?.message ?? String(err));
    return null;
  }
}

function checkRequiredFile(relPath: string) {
  if (exists(relPath)) add("ok", `${relPath} exists`);
  else add("fail", `${relPath} exists`, "Run /paper-ops setup or copy from the matching .example.yml file.");
}

function checkGitignore() {
  if (!exists(".gitignore")) {
    add("fail", ".gitignore exists");
    return;
  }

  const ignored = readText(".gitignore");
  const required = ["data/", "papers/", "analyses/", "reports/", "digests/", ".env", ".omc/"];

  for (const pattern of required) {
    if (ignored.includes(pattern)) add("ok", `.gitignore ignores ${pattern}`);
    else add("warn", `.gitignore ignores ${pattern}`, "Add this pattern to avoid committing local state or private data.");
  }
}

function checkSources(cfg: any) {
  const arxiv = cfg?.arxiv;
  if (!arxiv) {
    add("fail", "config/sources.yml has arxiv section");
    return;
  }

  if (Array.isArray(arxiv.categories) && arxiv.categories.length > 0) {
    add("ok", "arXiv categories configured", arxiv.categories.join(", "));
  } else {
    add("fail", "arXiv categories configured", "Set arxiv.categories in config/sources.yml.");
  }

  if (Number.isInteger(arxiv.max_results_per_scan) && arxiv.max_results_per_scan > 0) {
    add("ok", "max_results_per_scan is positive");
  } else {
    add("warn", "max_results_per_scan is positive", "Expected a positive integer.");
  }

  if (typeof arxiv.download_dir === "string" && arxiv.download_dir.trim()) {
    const isProjectLocal = !path.isAbsolute(arxiv.download_dir) && !arxiv.download_dir.startsWith("~");
    add(isProjectLocal ? "ok" : "warn", "download_dir is project-local", `Current value: ${arxiv.download_dir}`);
  } else {
    add("warn", "download_dir configured", "Recommended: arxiv.download_dir: papers");
  }
}

function checkScoring(cfg: any) {
  const weights = cfg?.weights;
  if (!weights || typeof weights !== "object") {
    add("fail", "config/scoring.yml has weights");
    return;
  }

  const values = Object.values(weights).map(Number);
  if (values.some((v) => Number.isNaN(v) || v < 0)) {
    add("fail", "scoring weights are non-negative numbers");
    return;
  }

  const sum = values.reduce((acc, v) => acc + v, 0);
  const closeToOne = Math.abs(sum - 1) < 0.001;
  add(closeToOne ? "ok" : "warn", "scoring weights sum to 1.0", `Current sum: ${sum.toFixed(3)}`);

  const thresholds = cfg?.thresholds;
  const required = ["must_read", "skim", "maybe", "ignore_for_now"];
  for (const key of required) {
    if (typeof thresholds?.[key] === "number") add("ok", `threshold ${key} configured`);
    else add("fail", `threshold ${key} configured`);
  }
}

function checkProfile(cfg: any) {
  if (cfg?.researcher?.field) add("ok", "researcher field configured", cfg.researcher.field);
  else add("warn", "researcher field configured", "Set researcher.field in config/profile.yml.");

  const primary = cfg?.research_interests?.primary;
  if (Array.isArray(primary) && primary.some((v) => String(v).trim())) {
    add("ok", "primary research interests configured");
  } else {
    add("warn", "primary research interests configured", "Add at least one non-empty interest.");
  }

  const openProblems = cfg?.open_problems;
  if (Array.isArray(openProblems) && openProblems.some((p) => String(p?.title ?? "").trim())) {
    add("ok", "open problems configured");
  } else {
    add("warn", "open problems configured", "Recommendations improve when open problems are specific.");
  }
}

function checkClaude() {
  const result = spawnSync("claude", ["--version"], {
    cwd: root,
    encoding: "utf8",
    timeout: 5000,
  });

  if (result.status === 0) {
    add("ok", "Claude CLI available", (result.stdout || result.stderr).trim());
  } else {
    add("warn", "Claude CLI available", "Required for evaluate/analyze when using the local Claude provider.");
  }
}

function checkDataDirs() {
  for (const dir of ["data", "papers", "analyses", "reports", "digests"]) {
    if (exists(dir)) add("ok", `${dir}/ directory exists`);
    else add("warn", `${dir}/ directory exists`, "It will be created by the relevant workflow when needed.");
  }
}

function printResults() {
  const icon: Record<CheckLevel, string> = {
    ok: "OK",
    warn: "WARN",
    fail: "FAIL",
  };

  console.log("ArXiver doctor\n");
  for (const check of checks) {
    console.log(`[${icon[check.level]}] ${check.label}`);
    if (check.detail) console.log(`       ${check.detail}`);
  }

  const fails = checks.filter((c) => c.level === "fail").length;
  const warns = checks.filter((c) => c.level === "warn").length;
  console.log(`\nSummary: ${fails} failed, ${warns} warnings, ${checks.length} checks`);

  if (fails > 0) process.exit(1);
}

for (const file of [
  "config/profile.yml",
  "config/scoring.yml",
  "config/sources.yml",
  "config/profile.example.yml",
  "config/scoring.example.yml",
  "config/sources.example.yml",
]) {
  checkRequiredFile(file);
}

const profile = exists("config/profile.yml") ? readYaml("config/profile.yml") : null;
const scoring = exists("config/scoring.yml") ? readYaml("config/scoring.yml") : null;
const sources = exists("config/sources.yml") ? readYaml("config/sources.yml") : null;

if (profile) checkProfile(profile);
if (scoring) checkScoring(scoring);
if (sources) checkSources(sources);

checkGitignore();
checkDataDirs();
checkClaude();
printResults();
