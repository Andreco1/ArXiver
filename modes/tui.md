# TUI Mode

Goal: browse, filter, queue papers, and trigger operational workflows from a single interactive terminal interface.

Inputs:
- `data/papers.jsonl`

Rules:
- No LLM call.
- Never modify paper statuses automatically.
- Archive, dismiss, and read require explicit confirmation ([y/n] prompt).
- Queue and reading changes are immediate.
- All writes are atomic.
- Preserve all existing paper fields.

## Required Implementation

The TUI MUST be launched with:

```
npx tsx scripts/tui.tsx
```

**Operational actions (scan, evaluate, digest) MUST call repository scripts:**
- `npx tsx scripts/scan-arxiv.ts`
- `npx tsx scripts/evaluate-papers.ts`
- `npx tsx scripts/generate-digest.ts`

Do NOT:
- Call curl, parse arXiv XML, or build paper objects in the TUI.
- Call an LLM directly from the TUI.
- Generate digest Markdown manually in the TUI.
- Modify `data/papers.jsonl` from scan/evaluate/digest handlers — the scripts handle that.

Scan/evaluate/digest/analyze failures MUST be surfaced in the TUI log panel (exit code + stdout/stderr).

Deep paper analysis MUST call the repository script:
- `npx tsx scripts/analyze-paper.ts <arxiv-id>`

The analyze script is allowed to call Claude because it is the dedicated provider boundary for full-PDF analysis. The TUI itself must only invoke the script and display progress/output.

Queue curation (queue, reading, archive, dismiss, read) remains human-controlled. Every status change requires an explicit key press and, for destructive actions, a [y/n] confirmation.

If `scripts/tui.tsx` is missing or broken:
1. Report the problem clearly.
2. Offer to fix the script.
3. Do not simulate TUI output in the chat.

## Command

```bash
# Launch TUI
npx tsx scripts/tui.tsx

# npm shortcut
npm run tui
```

## Layout

```
Header: ArXiver · Filter · Paper count
[Status bar: command running / succeeded / failed]
SCORE  RECOMMENDATION  STATUS  AN  ARXIV ID  TITLE
────────────────────────────────────────────────────────────
 List (left ~45%)            │  Detail panel (right ~55%)
  score rec status an id title
                             │   title, authors, categories
  ...                        │   score breakdown
                             │   PDF/analysis availability
                             │   why_read / why_skip
                             │   key claims
                             │   abstract
────────────────────────────────────────────────────────────
[Log panel: last 4 lines of command output]
Footer: keyboard shortcuts (or confirmation prompt)
```

## Keyboard Shortcuts

### Navigation & Curation

| Key     | Action                                    |
|---------|-------------------------------------------|
| ↑↓ / jk | Move selection                           |
| f       | Cycle filter (all → must_read → skim → …) |
| O       | Show selected paper analysis path in the log panel |
| M       | Open selected paper analysis Markdown viewer |
| H       | Generate and open selected paper HTML preview with KaTeX |
| u       | Queue selected paper (immediate)          |
| g       | Mark selected paper as reading (immediate)|
| x       | Mark selected paper as read (confirm)     |
| a       | Archive selected paper (confirm)          |
| d       | Dismiss selected paper (confirm)          |
| r       | Reload papers from disk                   |
| q       | Quit                                      |

### Operational Commands

| Key | Action                                         |
|-----|------------------------------------------------|
| W   | Download selected paper PDF to `arxiv.download_dir` |
| A   | Analyze selected paper and save Markdown/metadata to `analyses/` |
| F   | Force-regenerate selected paper analysis (`--force`) |
| S   | Run scan (`scripts/scan-arxiv.ts`)             |
| E   | Run evaluate, default limit (`scripts/evaluate-papers.ts`) |
| V   | Run evaluate, limit 10 (`--limit 10`)          |
| D   | Generate today's digest (`scripts/generate-digest.ts`) |
| Z   | Generate digest for all papers (`--all`)       |

While a command is running, H/W/A/F/S/E/V/D/Z are locked. Navigation and quit remain active.

### Analysis Viewer

| Key       | Action              |
|-----------|---------------------|
| ↑↓ / jk   | Scroll one line     |
| PgUp/PgDn | Scroll one page     |
| g         | Jump to top         |
| G         | Jump to bottom      |
| q / Esc   | Return to paper list|

The viewer is read-only and must not call an LLM or modify files.

## Analysis Indicators

The list includes an `AN` column:

- `A`: Markdown analysis exists in `analyses/<arxiv-id>.md`
- `P`: PDF is cached in `papers/<arxiv-id>.pdf`, but no analysis exists
- `—`: neither cached PDF nor analysis exists

The detail panel should show analysis path and metadata when
`analyses/<arxiv-id>.json` exists.
