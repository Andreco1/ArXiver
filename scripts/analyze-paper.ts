import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import YAML from "yaml";
import { PDFParse } from "pdf-parse";
import { readPapers, normalizeId, type Paper } from "./lib/papers.js";

const root = process.cwd();

function readYaml(file: string): any {
  return YAML.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function ensureDir(dir: string) {
  fs.mkdirSync(path.join(root, dir), { recursive: true });
}

function writeFileAtomic(file: string, data: string | Buffer) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function parseArgs(): { rawId: string; force: boolean } {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const rawId = args.find((arg) => !arg.startsWith("--"));

  if (!rawId) {
    console.error("Usage: tsx scripts/analyze-paper.ts <arxiv-id> [--force]");
    process.exit(1);
  }

  return { rawId, force };
}

function sha256(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function downloadPdf(paper: Paper, destDir: string): Promise<string> {
  const dest = path.join(root, destDir, `${paper.id}.pdf`);
  if (fs.existsSync(dest)) {
    console.log(`  PDF cached: ${destDir}/${paper.id}.pdf`);
    return dest;
  }
  console.log(`  Downloading PDF...`);
  const res = await fetch(paper.pdf_url, {
    headers: { "User-Agent": "ArXiver/1.0 (personal research tool)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileAtomic(dest, buf);
  console.log(`  Saved: ${destDir}/${paper.id}.pdf (${(buf.length / 1024).toFixed(0)} KB)`);
  return dest;
}

async function extractPdfText(pdfPath: string): Promise<string> {
  const parser = new PDFParse({ data: fs.readFileSync(pdfPath) });
  try {
    const result = await parser.getText();
    const text = result.text.replace(/\r/g, "").trim();
    if (text.length < 1000) {
      throw new Error(`Extracted PDF text is too short (${text.length} characters).`);
    }
    return text;
  } finally {
    await parser.destroy();
  }
}

function buildPrompt(paper: Paper, pdfRelPath: string, pdfText: string, profile: any): string {
  const interests = [
    ...(profile.research_interests?.primary ?? []),
    ...(profile.research_interests?.secondary ?? []),
  ].join("; ");

  const openProblems = (profile.open_problems ?? [])
    .map((p: any) => `- ${p.title}: ${p.description}`)
    .join("\n");

  return `You are a deep paper analyst for an academic researcher.

## Researcher Profile
Field: ${profile.researcher?.field ?? ""}
Research interests: ${interests}
Open problems:
${openProblems}
Notes: ${profile.notes?.trim() ?? ""}

## Task

Analyze the extracted full text from this PDF:
${pdfRelPath}

Use ONLY the extracted PDF text below plus the researcher profile. Do not infer
missing results from citations, metadata, figure names, or prior knowledge. If
the extracted text is missing a detail, say that the detail is not available in
the extracted text.

Produce a comprehensive analysis in Markdown with exactly these sections:

# ${paper.title}

**arXiv:** ${paper.arxiv_url}
**Authors:** ${paper.authors.join(", ")}
**Published:** ${paper.published_at.slice(0, 10)}
**Source:** Extracted text from ${pdfRelPath}

## Summary
One paragraph overview of the paper's core contribution.

## Problem Statement
What problem does this paper address and why does it matter?

## Methodology
Describe the approach, architecture, or algorithm in enough detail that someone could reimplement the core idea. Include key design choices.

## Key Equations & Theorems
List the most important equations or theorems with brief explanations. Use LaTeX notation (e.g. $E = mc^2$). If none are central, write "None central."

## Results
Main empirical or theoretical results. Include numbers, comparisons to baselines, and statistical significance where stated.

## Strengths
3–5 bullet points on what the paper does well.

## Limitations & Open Questions
3–5 bullet points. Flag anything relevant to the researcher's open problems above.

## Relevance to Researcher
Explain how this paper connects to the researcher's stated interests and open problems. Be specific: quote terms from both the paper and the profile.

---
*Analyzed at: ${new Date().toISOString()}*

## Extracted PDF Text

${pdfText}`;
}

async function main() {
  const { rawId, force } = parseArgs();
  const targetId = normalizeId(rawId);
  const papers = readPapers();

  const paper =
    papers.get(targetId) ??
    Array.from(papers.values()).find(
      (p) => normalizeId(p.id) === targetId
    );

  if (!paper) {
    console.error(`Paper not found in data/papers.jsonl: ${rawId}`);
    process.exit(1);
  }

  ensureDir("analyses");
  const outPath = path.join(root, "analyses", `${paper.id}.md`);
  const metaPath = path.join(root, "analyses", `${paper.id}.json`);

  if ((fs.existsSync(outPath) || fs.existsSync(metaPath)) && !force) {
    console.error(`Analysis already exists for ${paper.id}.`);
    console.error(`  Markdown: analyses/${paper.id}.md`);
    if (fs.existsSync(metaPath)) console.error(`  Metadata: analyses/${paper.id}.json`);
    console.error("Use --force to overwrite.");
    process.exit(1);
  }

  const profile = readYaml("config/profile.yml");

  console.log(`Analyzing: ${paper.title}`);
  console.log(`ID: ${paper.id}`);

  ensureDir("papers");

  const pdfPath = await downloadPdf(paper, "papers");
  const pdfRelPath = path.relative(root, pdfPath);
  console.log("  Extracting PDF text...");
  const pdfText = await extractPdfText(pdfPath);
  console.log(`  Extracted ${pdfText.length} characters.`);
  const prompt = buildPrompt(paper, pdfRelPath, pdfText, profile);

  console.log("  Calling Claude (using extracted PDF text)...");
  const analysis = execFileSync("claude", ["-p"], {
    input: prompt,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    cwd: root,
  });

  const generatedAt = new Date().toISOString();
  const metadata = {
    paper_id: paper.id,
    title: paper.title,
    pdf_path: pdfRelPath,
    pdf_url: paper.pdf_url,
    pdf_sha256: sha256(pdfPath),
    pdf_size_bytes: fs.statSync(pdfPath).size,
    analysis_path: path.relative(root, outPath),
    source: "extracted_pdf_text",
    extracted_characters: pdfText.length,
    generated_at: generatedAt,
    provider: "claude_cli",
    forced_overwrite: force,
  };

  writeFileAtomic(outPath, analysis.trim() + "\n");
  writeFileAtomic(metaPath, JSON.stringify(metadata, null, 2) + "\n");
  console.log(`  Analysis saved: analyses/${paper.id}.md`);
  console.log(`  Metadata saved: analyses/${paper.id}.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
