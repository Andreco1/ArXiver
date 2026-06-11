import { useState, useEffect, useCallback, useMemo } from "react";
import { render, Box, Text, useInput, useApp, useStdout } from "ink";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import YAML from "yaml";
import {
  readPapers,
  writeJsonlAtomic,
  type Paper,
  type Status,
  type Recommendation,
} from "./lib/papers.js";

// ── Types ────────────────────────────────────────────────────────────────────

type FilterMode =
  | "all_evaluated"
  | "must_read"
  | "skim"
  | "maybe"
  | "ignore_for_now";

type ConfirmAction = {
  action: "archive" | "dismiss" | "read";
  paper: Paper;
};

type CmdStatus = {
  label: string;
  state: "running" | "ok" | "failed";
  code?: number;
};

type AnalysisMetadata = {
  source?: string;
  extracted_characters?: number;
  generated_at?: string;
  provider?: string;
  pdf_path?: string;
  analysis_path?: string;
  forced_overwrite?: boolean;
};

// ── Constants ────────────────────────────────────────────────────────────────

const FILTER_CYCLE: FilterMode[] = [
  "all_evaluated",
  "must_read",
  "skim",
  "maybe",
  "ignore_for_now",
];

const FILTER_LABELS: Record<FilterMode, string> = {
  all_evaluated: "All Evaluated",
  must_read: "Must Read",
  skim: "Skim",
  maybe: "Maybe",
  ignore_for_now: "Ignore For Now",
};

const REC_COLOR: Record<Recommendation, string> = {
  must_read: "green",
  skim: "cyan",
  maybe: "yellow",
  ignore_for_now: "gray",
};

const STATUS_COLOR: Record<Status, string> = {
  new: "white",
  recommended: "blue",
  queued: "cyan",
  reading: "yellow",
  read: "green",
  archived: "gray",
  dismissed: "red",
};

// Column widths inside the list panel
const COL_SCORE = 6;
const COL_REC = 14;
const COL_STATUS = 9;
const COL_ANALYSIS = 4;
const COL_ID = 15;

const VISIBLE_ROWS = 14;
const LOG_VISIBLE = 4;
const LOG_MEMORY = 20;
const VIEWER_MARGIN_ROWS = 4;

// ── runScript ─────────────────────────────────────────────────────────────────

function runScript(
  args: string[],
  onLine: (line: string) => void
): Promise<{ code: number }> {
  return new Promise((resolve) => {
    const child = spawn("npx", args, {
      cwd: process.cwd(),
      env: process.env,
    });

    const handleChunk = (chunk: Buffer) => {
      chunk
        .toString()
        .split("\n")
        .filter(Boolean)
        .forEach(onLine);
    };

    if (child.stdout) child.stdout.on("data", handleChunk);
    if (child.stderr) child.stderr.on("data", handleChunk);

    child.on("close", (code) => {
      resolve({ code: code ?? 1 });
    });
  });
}

// ── Config ───────────────────────────────────────────────────────────────────

function readDownloadDir(): string {
  try {
    const cfg = YAML.parse(
      fs.readFileSync(path.join(process.cwd(), "config/sources.yml"), "utf8")
    );
    const raw: string = cfg?.arxiv?.download_dir ?? "~/Downloads";
    return raw.replace(/^~/, os.homedir());
  } catch {
    return path.join(os.homedir(), "Downloads");
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function relExists(relPath: string): boolean {
  return fs.existsSync(path.join(process.cwd(), relPath));
}

function analysisPaths(id: string) {
  return {
    pdf: `papers/${id}.pdf`,
    markdown: `analyses/${id}.md`,
    metadata: `analyses/${id}.json`,
  };
}

function readAnalysisMetadata(id: string): AnalysisMetadata | null {
  const { metadata } = analysisPaths(id);
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), metadata), "utf8"));
  } catch {
    return null;
  }
}

function readAnalysisMarkdown(id: string): string | null {
  const { markdown } = analysisPaths(id);
  try {
    return fs.readFileSync(path.join(process.cwd(), markdown), "utf8");
  } catch {
    return null;
  }
}

function applyFilter(papers: Paper[], filter: FilterMode): Paper[] {
  let result = papers.filter((p) => p.evaluation);
  if (filter !== "all_evaluated") {
    result = result.filter((p) => p.evaluation?.recommendation === filter);
  }
  return result.sort(
    (a, b) =>
      (b.evaluation?.total_score ?? 0) - (a.evaluation?.total_score ?? 0)
  );
}

// ── PaperRow ─────────────────────────────────────────────────────────────────

function PaperRow({
  paper,
  isSelected,
  listWidth,
}: {
  paper: Paper;
  isSelected: boolean;
  listWidth: number;
}) {
  const score = (paper.evaluation?.total_score.toFixed(2) ?? "—").padEnd(COL_SCORE);
  const rec = (paper.evaluation?.recommendation ?? "—")
    .replace(/_/g, " ")
    .slice(0, COL_REC - 1)
    .padEnd(COL_REC);
  const status = paper.status.padEnd(COL_STATUS);
  const paths = analysisPaths(paper.id);
  const analysis = relExists(paths.markdown) ? "A" : relExists(paths.pdf) ? "P" : "—";
  const analysisCol = analysis.padEnd(COL_ANALYSIS);
  const id = paper.id.padEnd(COL_ID);
  const titleWidth = Math.max(6, listWidth - COL_SCORE - COL_REC - COL_STATUS - COL_ANALYSIS - COL_ID);
  const title = truncate(paper.title, titleWidth);

  const recKey = paper.evaluation?.recommendation;
  const recColor = recKey ? REC_COLOR[recKey] : "white";
  const stColor = STATUS_COLOR[paper.status] ?? "white";

  if (isSelected) {
    return (
      <Box>
        <Text inverse>{`${score}${rec}${status}${analysisCol}${id}${title}`}</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text>{score}</Text>
      <Text color={recColor as any}>{rec}</Text>
      <Text color={stColor as any}>{status}</Text>
      <Text color={analysis === "A" ? "green" : analysis === "P" ? "yellow" : "gray"}>{analysisCol}</Text>
      <Text dimColor>{id}</Text>
      <Text>{title}</Text>
    </Box>
  );
}

// ── DetailPanel ──────────────────────────────────────────────────────────────

function DetailPanel({ paper, width }: { paper: Paper | null; width: number }) {
  if (!paper) {
    return (
      <Box paddingLeft={1}>
        <Text dimColor>No paper selected. Press S to scan for papers.</Text>
      </Box>
    );
  }

  const ev = paper.evaluation;
  const w = width - 2;
  const paths = analysisPaths(paper.id);
  const hasPdf = relExists(paths.pdf);
  const hasAnalysis = relExists(paths.markdown);
  const meta = readAnalysisMetadata(paper.id);

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Text bold wrap="wrap">{paper.title}</Text>
      <Text> </Text>
      <Text dimColor wrap="truncate">{paper.authors.slice(0, 5).join(", ")}</Text>
      <Text dimColor>{paper.categories.join(", ")} · {paper.published_at.slice(0, 10)}</Text>
      <Text dimColor wrap="truncate">abs: {paper.arxiv_url}</Text>
      <Text dimColor wrap="truncate">pdf: {paper.pdf_url}</Text>
      <Text> </Text>
      <Text>
        Analysis:{" "}
        {hasAnalysis ? (
          <Text color="green">yes</Text>
        ) : (
          <Text color="gray">no</Text>
        )}
        {"  "}
        PDF:{" "}
        {hasPdf ? <Text color="green">cached</Text> : <Text color="gray">not cached</Text>}
      </Text>
      {hasAnalysis && (
        <>
          <Text dimColor wrap="truncate">analysis: {paths.markdown}</Text>
          {meta && (
            <Text dimColor wrap="truncate">
              source: {meta.source ?? "unknown"} · chars: {meta.extracted_characters ?? "?"} · provider: {meta.provider ?? "?"}
            </Text>
          )}
        </>
      )}
      {ev && (
        <>
          <Text> </Text>
          <Text bold>
            Score: <Text>{ev.total_score.toFixed(2)}</Text>{"  "}
            <Text color={REC_COLOR[ev.recommendation] as any}>
              {ev.recommendation.replace(/_/g, " ")}
            </Text>
          </Text>
          <Text dimColor>{"  novelty".padEnd(28)}{ev.scores.novelty}</Text>
          <Text dimColor>{"  open_problem_fit".padEnd(28)}{ev.scores.open_problem_fit}</Text>
          <Text dimColor>{"  methodological_relevance".padEnd(28)}{ev.scores.methodological_relevance}</Text>
          <Text dimColor>{"  result_importance".padEnd(28)}{ev.scores.result_importance}</Text>
          <Text dimColor>{"  readability".padEnd(28)}{ev.scores.readability}</Text>
          {ev.why_read && (
            <>
              <Text> </Text>
              <Text bold>Why read: </Text>
              <Text wrap="wrap">{truncate(ev.why_read, w)}</Text>
            </>
          )}
          {ev.why_skip && (
            <>
              <Text bold>Why skip: </Text>
              <Text wrap="wrap">{truncate(ev.why_skip, w)}</Text>
            </>
          )}
          {ev.key_claims.length > 0 && (
            <>
              <Text> </Text>
              <Text bold>Key claims:</Text>
              {ev.key_claims.slice(0, 3).map((c, i) => (
                <Text key={i} wrap="wrap">{"  • "}{truncate(c, w - 4)}</Text>
              ))}
            </>
          )}
          <Text> </Text>
          <Text bold>Abstract:</Text>
          <Text wrap="wrap">{truncate(paper.abstract, 400)}</Text>
        </>
      )}
    </Box>
  );
}

// ── StatusBar ─────────────────────────────────────────────────────────────────

function StatusBar({ status }: { status: CmdStatus | null }) {
  if (!status) return null;

  if (status.state === "running") {
    return (
      <Box paddingX={1}>
        <Text color="yellow">⟳ {status.label} running…</Text>
      </Box>
    );
  }
  if (status.state === "ok") {
    return (
      <Box paddingX={1}>
        <Text color="green">✓ {status.label} completed</Text>
      </Box>
    );
  }
  return (
    <Box paddingX={1}>
      <Text color="red">✗ {status.label} failed (exit {status.code ?? "?"})</Text>
    </Box>
  );
}

// ── LogPanel ──────────────────────────────────────────────────────────────────

function LogPanel({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  const visible = lines.slice(-LOG_VISIBLE);
  return (
    <Box flexDirection="column" paddingX={1}>
      {visible.map((line, i) => (
        <Text key={i} dimColor wrap="truncate">{line}</Text>
      ))}
    </Box>
  );
}

// ── ConfirmBar ────────────────────────────────────────────────────────────────

function ConfirmBar({ confirm }: { confirm: ConfirmAction }) {
  return (
    <Box paddingX={1}>
      <Text>
        <Text bold color="yellow">{confirm.action.toUpperCase()}</Text>{" "}
        <Text bold>{confirm.paper.id}</Text>{" "}
        <Text dimColor>{truncate(confirm.paper.title, 45)}</Text>
        <Text bold> — confirm? [y/n]</Text>
      </Text>
    </Box>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer({ cmdRunning }: { cmdRunning: boolean }) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text dimColor>
        ↑↓/jk move · f filter · u queue · g reading · x read · a archive · d dismiss
      </Text>
      <Box>
        <Text dimColor>O path · M view · H html · W download · A analyze · F force-analyze · S scan · E eval · V eval×10 · D digest · Z digest-all · r reload · q quit</Text>
        {cmdRunning && <Text color="yellow">  [running — H/W/A/F/S/E/V/D/Z locked]</Text>}
      </Box>
    </Box>
  );
}

// ── AnalysisViewer ───────────────────────────────────────────────────────────

function AnalysisViewer({
  paper,
  content,
  scroll,
  height,
}: {
  paper: Paper;
  content: string;
  scroll: number;
  height: number;
}) {
  const lines = content.split("\n");
  const visibleCount = Math.max(4, height - VIEWER_MARGIN_ROWS);
  const visible = lines.slice(scroll, scroll + visibleCount);

  return (
    <Box flexDirection="column">
      <Box>
        <Text backgroundColor="magenta" color="white" bold>
          {`  Analysis Viewer · ${paper.id} · ${paper.title}`.slice(0, 200)}
        </Text>
      </Box>
      <Box flexDirection="column" paddingX={1}>
        {visible.map((line, i) => (
          <Text key={i} wrap="truncate">{line || " "}</Text>
        ))}
      </Box>
      <Box paddingX={1}>
        <Text dimColor>
          ↑↓/jk scroll · PgUp/PgDn page · g top · G bottom · q/Esc back · {Math.min(scroll + visibleCount, lines.length)}/{lines.length}
        </Text>
      </Box>
    </Box>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 120;
  const termHeight = stdout?.rows ?? 32;
  const listWidth = Math.max(55, Math.floor(termWidth * 0.45));

  const [allPapers, setAllPapers] = useState<Paper[]>([]);
  const [filter, setFilter] = useState<FilterMode>("all_evaluated");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [cmdRunning, setCmdRunning] = useState(false);
  const [cmdStatus, setCmdStatus] = useState<CmdStatus | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [viewerPaper, setViewerPaper] = useState<Paper | null>(null);
  const [viewerContent, setViewerContent] = useState<string | null>(null);
  const [viewerScroll, setViewerScroll] = useState(0);

  const reload = useCallback(() => {
    const map = readPapers();
    setAllPapers(Array.from(map.values()));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = useMemo(
    () => applyFilter(allPapers, filter),
    [allPapers, filter]
  );

  const safeIndex = filtered.length > 0
    ? Math.min(selectedIndex, filtered.length - 1)
    : 0;
  const selected = filtered[safeIndex] ?? null;

  const move = useCallback(
    (delta: number) => {
      setSelectedIndex((prev) => {
        const next = Math.max(0, Math.min(filtered.length - 1, prev + delta));
        setScrollOffset((off) => {
          if (next < off) return next;
          if (next >= off + VISIBLE_ROWS) return next - VISIBLE_ROWS + 1;
          return off;
        });
        return next;
      });
    },
    [filtered.length]
  );

  const applyStatus = useCallback(
    (paper: Paper | null, status: Status) => {
      if (!paper) return;
      const map = readPapers();
      const p = map.get(paper.id);
      if (!p) return;
      p.status = status;
      p.updated_local_at = new Date().toISOString();
      map.set(p.id, p);
      writeJsonlAtomic(map);
      reload();
    },
    [reload]
  );

  const showAnalysisPath = useCallback((paper: Paper | null) => {
    if (!paper) return;
    const { markdown, metadata } = analysisPaths(paper.id);
    if (!relExists(markdown)) {
      setLogLines((prev) => [
        ...prev.slice(-(LOG_MEMORY - 1)),
        `No analysis for ${paper.id}. Press A to analyze.`,
      ]);
      return;
    }
    const line = relExists(metadata)
      ? `Analysis: ${markdown} · metadata: ${metadata}`
      : `Analysis: ${markdown}`;
    setLogLines((prev) => [...prev.slice(-(LOG_MEMORY - 1)), line]);
  }, []);

  const openAnalysisViewer = useCallback((paper: Paper | null) => {
    if (!paper) return;
    const content = readAnalysisMarkdown(paper.id);
    if (!content) {
      setLogLines((prev) => [
        ...prev.slice(-(LOG_MEMORY - 1)),
        `No analysis for ${paper.id}. Press A to analyze.`,
      ]);
      return;
    }
    setViewerPaper(paper);
    setViewerContent(content);
    setViewerScroll(0);
  }, []);

  const handleRunScript = useCallback(
    (label: string, args: string[]) => {
      if (cmdRunning) return;
      setCmdRunning(true);
      setCmdStatus({ label, state: "running" });
      setLogLines([`[${label}] starting…`]);

      runScript(args, (line) => {
        setLogLines((prev) => [...prev.slice(-(LOG_MEMORY - 1)), line]);
      }).then(({ code }) => {
        setCmdRunning(false);
        if (code === 0) {
          setCmdStatus({ label, state: "ok" });
          reload();
        } else {
          setCmdStatus({ label, state: "failed", code });
        }
      });
    },
    [cmdRunning, reload]
  );

  const handleDownload = useCallback(
    (paper: Paper | null) => {
      if (!paper || cmdRunning) return;
      const dir = readDownloadDir();
      const dest = path.join(dir, `${paper.id}.pdf`);

      setCmdRunning(true);
      setCmdStatus({ label: `download ${paper.id}`, state: "running" });
      setLogLines([`[download] ${paper.pdf_url}`]);

      (async () => {
        try {
          fs.mkdirSync(dir, { recursive: true });
          const res = await fetch(paper.pdf_url);
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
          const buf = Buffer.from(await res.arrayBuffer());
          fs.writeFileSync(dest, buf);
          setCmdStatus({ label: `download ${paper.id}`, state: "ok" });
          setLogLines((prev) => [...prev, `Saved → ${dest}`]);
        } catch (err: any) {
          setCmdStatus({ label: `download ${paper.id}`, state: "failed" });
          setLogLines((prev) => [...prev, String(err?.message ?? err)]);
        } finally {
          setCmdRunning(false);
        }
      })();
    },
    [cmdRunning]
  );

  useInput((input, key) => {
    if (viewerPaper && viewerContent) {
      const lineCount = viewerContent.split("\n").length;
      const visibleCount = Math.max(4, termHeight - VIEWER_MARGIN_ROWS);
      const maxScroll = Math.max(0, lineCount - visibleCount);

      if (input === "q" || key.escape) {
        setViewerPaper(null);
        setViewerContent(null);
        setViewerScroll(0);
      } else if (key.upArrow || input === "k") {
        setViewerScroll((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow || input === "j") {
        setViewerScroll((prev) => Math.min(maxScroll, prev + 1));
      } else if (key.pageUp) {
        setViewerScroll((prev) => Math.max(0, prev - visibleCount));
      } else if (key.pageDown) {
        setViewerScroll((prev) => Math.min(maxScroll, prev + visibleCount));
      } else if (input === "g") {
        setViewerScroll(0);
      } else if (input === "G") {
        setViewerScroll(maxScroll);
      }
      return;
    }

    if (confirm) {
      if (input === "y") {
        const statusMap: Record<"archive" | "dismiss" | "read", Status> = {
          archive: "archived",
          dismiss: "dismissed",
          read: "read",
        };
        applyStatus(confirm.paper, statusMap[confirm.action]);
        setConfirm(null);
      } else if (input === "n" || key.escape) {
        setConfirm(null);
      }
      return;
    }

    // Navigation and quit always work
    if (key.upArrow || input === "k") move(-1);
    else if (key.downArrow || input === "j") move(1);
    else if (input === "q") exit();
    else if (input === "r") reload();
    else if (input === "f") {
      setFilter((prev) => {
        const i = FILTER_CYCLE.indexOf(prev);
        return FILTER_CYCLE[(i + 1) % FILTER_CYCLE.length];
      });
      setSelectedIndex(0);
      setScrollOffset(0);
    }

    // Queue curation (immediate)
    else if (input === "u" && selected) applyStatus(selected, "queued");
    else if (input === "g" && selected) applyStatus(selected, "reading");

    // Queue curation (requires confirm)
    else if (input === "a" && selected) setConfirm({ action: "archive", paper: selected });
    else if (input === "d" && selected) setConfirm({ action: "dismiss", paper: selected });
    else if (input === "x" && selected) setConfirm({ action: "read", paper: selected });

    // Operational commands (blocked while running)
    else if (input === "S") handleRunScript("scan", ["tsx", "scripts/scan-arxiv.ts"]);
    else if (input === "E") handleRunScript("evaluate", ["tsx", "scripts/evaluate-papers.ts"]);
    else if (input === "V") handleRunScript("evaluate ×10", ["tsx", "scripts/evaluate-papers.ts", "--limit", "10"]);
    else if (input === "D") handleRunScript("digest", ["tsx", "scripts/generate-digest.ts"]);
    else if (input === "Z") handleRunScript("digest --all", ["tsx", "scripts/generate-digest.ts", "--all"]);
    else if (input === "O" && selected) showAnalysisPath(selected);
    else if (input === "M" && selected) openAnalysisViewer(selected);
    else if (input === "H" && selected) handleRunScript(`preview ${selected.id}`, ["tsx", "scripts/generate-preview.ts", selected.id, "--open"]);
    else if (input === "A" && selected) handleRunScript(`analyze ${selected.id}`, ["tsx", "scripts/analyze-paper.ts", selected.id]);
    else if (input === "F" && selected) handleRunScript(`force analyze ${selected.id}`, ["tsx", "scripts/analyze-paper.ts", selected.id, "--force"]);
    else if (input === "W" && selected) handleDownload(selected);
  });

  const visibleRows = filtered.slice(scrollOffset, scrollOffset + VISIBLE_ROWS);
  const detailWidth = termWidth - listWidth;
  const headerText = `  ArXiver  ·  ${FILTER_LABELS[filter]}  (${filtered.length} papers)`;

  if (viewerPaper && viewerContent) {
    return (
      <AnalysisViewer
        paper={viewerPaper}
        content={viewerContent}
        scroll={viewerScroll}
        height={termHeight}
      />
    );
  }

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box>
        <Text backgroundColor="blue" color="white" bold>
          {headerText.padEnd(termWidth)}
        </Text>
      </Box>

      {/* Command status bar */}
      <StatusBar status={cmdStatus} />

      {/* Column headers */}
      <Box width={listWidth}>
        <Text dimColor>
          {"SCORE".padEnd(COL_SCORE)}
          {"RECOMMENDATION".padEnd(COL_REC)}
          {"STATUS".padEnd(COL_STATUS)}
          {"AN".padEnd(COL_ANALYSIS)}
          {"ARXIV ID".padEnd(COL_ID)}
          TITLE
        </Text>
      </Box>

      {/* Main area: list + detail */}
      <Box flexDirection="row">
        <Box flexDirection="column" width={listWidth}>
          {visibleRows.map((paper, i) => (
            <PaperRow
              key={paper.id}
              paper={paper}
              isSelected={scrollOffset + i === safeIndex}
              listWidth={listWidth}
            />
          ))}
          {filtered.length === 0 && (
            <Text dimColor>  No papers. Press S to scan, E to evaluate.</Text>
          )}
        </Box>
        <Box flexDirection="column" width={detailWidth} overflow="hidden">
          <DetailPanel paper={selected} width={detailWidth} />
        </Box>
      </Box>

      {/* Log panel */}
      <LogPanel lines={logLines} />

      {/* Footer or confirm prompt */}
      {confirm ? <ConfirmBar confirm={confirm} /> : <Footer cmdRunning={cmdRunning} />}
    </Box>
  );
}

// ── Entry point ───────────────────────────────────────────────────────────────

const { waitUntilExit } = render(<App />);
waitUntilExit().then(() => process.exit(0));
