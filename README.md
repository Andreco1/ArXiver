# ArXiver

ArXiver is a local, human-in-the-loop arXiv literature triage system. It scans
papers, evaluates them against a research profile, generates digests, and helps
curate a reading queue from the terminal.

The core rule is simple: ArXiver recommends; the researcher decides. It never
archives, dismisses, queues, or marks papers as read unless you explicitly do it.

## Features

- Scan configured arXiv categories.
- Evaluate new papers against your research profile.
- Generate daily digests.
- Curate a reading queue in a terminal UI.
- Download and analyze full PDFs with Claude.
- Generate local HTML previews with KaTeX-rendered math.
- Keep private research data out of git by default.

## Setup

Install dependencies:

```bash
npm install
```

Create local config files from the examples:

```bash
cp config/profile.example.yml config/profile.yml
cp config/scoring.example.yml config/scoring.yml
cp config/sources.example.yml config/sources.yml
```

Edit:

- `config/profile.yml`: your field, interests, open problems, methods
- `config/scoring.yml`: scoring weights and thresholds
- `config/sources.yml`: arXiv categories and scan settings

Check the project:

```bash
npm run doctor
```

## Claude Command

ArXiver includes a Claude Code skill at:

```txt
.claude/skills/paper-ops/SKILL.md
```

From Claude Code, run:

```txt
/paper-ops
/paper-ops scan
/paper-ops evaluate
/paper-ops digest
/paper-ops tui
/paper-ops analyze <arxiv-id>
/paper-ops preview <arxiv-id>
```

Each mode is documented under `modes/`.

## Daily Workflow

```bash
npm run tui
```

Useful TUI shortcuts:

- `S`: scan arXiv
- `E`: evaluate new papers
- `D`: generate today's digest
- `A`: analyze the selected paper's full PDF
- `F`: force-regenerate the selected paper analysis
- `H`: generate and open an HTML preview
- `M`: view the Markdown analysis inside the TUI
- `O`: show analysis paths
- `u`: queue selected paper
- `g`: mark selected paper as reading
- `x`: mark selected paper as read

## Direct Commands

```bash
npm run scan
npm run evaluate
npm run digest
npm run analyze -- <arxiv-id>
npm run analyze -- <arxiv-id> --force
npm run preview -- <arxiv-id>
npm run preview -- <arxiv-id> --open
npm run queue -- list
npm run doctor
```

## Local Data

ArXiver stores local state and generated outputs in:

- `data/`: paper tracker and queue state
- `reports/`: abstract-only evaluation reports
- `digests/`: daily digest Markdown
- `papers/`: downloaded PDFs
- `analyses/`: full-PDF analysis Markdown and metadata
- `previews/`: generated HTML previews

These paths are intentionally ignored by git. The versioned files are the
workflow, scripts, docs, modes, and example configuration files.

## Verification

```bash
npm run doctor
npx tsc --noEmit
npm test
```

## Privacy

Do not commit local config or generated research data. The `.gitignore` excludes:

- `config/profile.yml`
- `config/scoring.yml`
- `config/sources.yml`
- `data/`
- `papers/`
- `analyses/`
- `reports/`
- `digests/`
- `previews/`
- `.env*`
- `.omc/`
