import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  findPaper,
  normalizeId,
  readPapers,
  writeJsonlAtomic,
  type Paper,
} from "../scripts/lib/papers.js";

function samplePaper(overrides: Partial<Paper> = {}): Paper {
  return {
    id: "2606.12345",
    title: "Test Paper",
    authors: ["Ada Lovelace"],
    abstract: "A test abstract.",
    categories: ["cs.LG"],
    primary_category: "cs.LG",
    published_at: "2026-06-10T00:00:00Z",
    updated_at: "2026-06-10T00:00:00Z",
    arxiv_url: "https://arxiv.org/abs/2606.12345",
    pdf_url: "https://arxiv.org/pdf/2606.12345",
    status: "new",
    created_at: "2026-06-10T00:00:00Z",
    updated_local_at: "2026-06-10T00:00:00Z",
    ...overrides,
  };
}

test("normalizeId strips arXiv version suffixes", () => {
  assert.equal(normalizeId("2606.12345v2"), "2606.12345");
  assert.equal(normalizeId("math/9901001v1"), "math/9901001");
  assert.equal(normalizeId("2606.12345"), "2606.12345");
});

test("findPaper matches exact and normalized ids", () => {
  const paper = samplePaper({ id: "2606.12345" });
  const papers = new Map([[paper.id, paper]]);

  assert.equal(findPaper(papers, "2606.12345"), paper);
  assert.equal(findPaper(papers, "2606.12345v3"), paper);
  assert.equal(findPaper(papers, "2606.99999"), null);
});

test("writeJsonlAtomic and readPapers round-trip JSONL from cwd", () => {
  const prevCwd = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arxiver-test-"));

  try {
    process.chdir(tmp);
    fs.mkdirSync("data");

    const older = samplePaper({
      id: "2606.00001",
      title: "Older",
      published_at: "2026-06-09T00:00:00Z",
    });
    const newer = samplePaper({
      id: "2606.00002",
      title: "Newer",
      published_at: "2026-06-11T00:00:00Z",
    });

    writeJsonlAtomic(new Map([[older.id, older], [newer.id, newer]]));
    const rows = fs.readFileSync("data/papers.jsonl", "utf8").trim().split("\n");
    assert.equal(JSON.parse(rows[0]).id, "2606.00002");

    const read = readPapers();
    assert.equal(read.size, 2);
    assert.equal(read.get("2606.00001")?.title, "Older");
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
