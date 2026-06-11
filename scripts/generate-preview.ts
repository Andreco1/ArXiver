import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { marked } from "marked";
import katex from "katex";
import { normalizeId } from "./lib/papers.js";

const root = process.cwd();

function usage(): never {
  console.error("Usage: tsx scripts/generate-preview.ts <arxiv-id> [--open]");
  process.exit(1);
}

function ensureDir(dir: string) {
  fs.mkdirSync(path.join(root, dir), { recursive: true });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderMath(markdown: string): string {
  const rendered: string[] = [];

  function stash(tex: string, displayMode: boolean): string {
    const html = katex.renderToString(tex.trim(), {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
      output: "html",
    });
    const token = `@@ARXIVER_MATH_${rendered.length}@@`;
    rendered.push(html);
    return token;
  }

  let withTokens = markdown
    .replace(/\$\$([\s\S]+?)\$\$/g, (_match, tex) => stash(tex, true))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_match, tex) => stash(tex, true))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_match, tex) => stash(tex, false))
    .replace(/(?<!\$)\$([^\n$]+?)\$(?!\$)/g, (_match, tex) => stash(tex, false));

  withTokens = escapeHtml(withTokens);

  for (let i = 0; i < rendered.length; i++) {
    withTokens = withTokens.replaceAll(`@@ARXIVER_MATH_${i}@@`, rendered[i]);
  }

  return withTokens;
}

function htmlPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="../node_modules/katex/dist/katex.min.css">
  <style>
    :root {
      color-scheme: light dark;
      --bg: #fafafa;
      --fg: #171717;
      --muted: #666;
      --border: #ddd;
      --code: #f1f1f1;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #111;
        --fg: #eee;
        --muted: #aaa;
        --border: #333;
        --code: #1f1f1f;
      }
    }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--fg);
      font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      max-width: 920px;
      margin: 0 auto;
      padding: 40px 24px 72px;
    }
    h1, h2, h3 { line-height: 1.2; }
    h1 { font-size: 2rem; border-bottom: 1px solid var(--border); padding-bottom: .5rem; }
    h2 { margin-top: 2rem; border-bottom: 1px solid var(--border); padding-bottom: .25rem; }
    a { color: #2563eb; }
    blockquote {
      border-left: 4px solid var(--border);
      color: var(--muted);
      margin-left: 0;
      padding-left: 1rem;
    }
    code {
      background: var(--code);
      padding: .15rem .3rem;
      border-radius: 4px;
    }
    pre {
      background: var(--code);
      padding: 1rem;
      overflow: auto;
      border-radius: 6px;
    }
    pre code { padding: 0; }
    table {
      border-collapse: collapse;
      width: 100%;
      overflow: auto;
    }
    th, td {
      border: 1px solid var(--border);
      padding: .4rem .55rem;
      vertical-align: top;
    }
    .katex-display {
      overflow-x: auto;
      overflow-y: hidden;
      padding: .25rem 0;
    }
  </style>
</head>
<body>
  <main>
${body}
  </main>
</body>
</html>
`;
}

function openFile(file: string): { ok: boolean; message: string } {
  const platform = os.platform();
  const command =
    platform === "darwin"
      ? "open"
      : platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args =
    platform === "win32"
      ? ["/c", "start", "", file]
      : [file];

  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    stdio: "pipe",
  });

  if (result.status === 0) {
    return { ok: true, message: `Preview opened: ${path.relative(root, file)}` };
  }

  const details = [result.stderr, result.stdout]
    .filter(Boolean)
    .join("\n")
    .trim();
  return {
    ok: false,
    message: details
      ? `Preview written but could not be opened automatically: ${details}`
      : `Preview written but could not be opened automatically. Open ${path.relative(root, file)} manually.`,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const rawId = args.find((arg) => !arg.startsWith("--"));
  const shouldOpen = args.includes("--open");
  if (!rawId) usage();

  const id = normalizeId(rawId);
  const inputPath = path.join(root, "analyses", `${id}.md`);
  const outputPath = path.join(root, "previews", `${id}.html`);

  if (!fs.existsSync(inputPath)) {
    console.error(`Analysis not found: analyses/${id}.md`);
    console.error("Run analyze first.");
    process.exit(1);
  }

  ensureDir("previews");

  const markdown = fs.readFileSync(inputPath, "utf8");
  const withMath = renderMath(markdown);
  const body = await marked.parse(withMath, {
    async: true,
    gfm: true,
    breaks: false,
  });

  const html = htmlPage(`ArXiver Preview ${id}`, body);
  fs.writeFileSync(outputPath, html);
  console.log(`Preview written: previews/${id}.html`);

  if (shouldOpen) {
    const result = openFile(outputPath);
    const write = result.ok ? console.log : console.error;
    write(result.message);
    if (!result.ok) process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
