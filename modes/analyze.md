# Analyze Mode

Goal: run a deep, full-PDF analysis for one selected paper and save it as Markdown.

Inputs:
- `data/papers.jsonl`
- `config/profile.yml`
- selected arXiv ID

Outputs:
- downloaded PDF in `papers/<arxiv-id>.pdf`
- analysis in `analyses/<arxiv-id>.md`
- analysis metadata in `analyses/<arxiv-id>.json`

## Required Implementation

The analyze workflow MUST use the repository script:

```bash
npx tsx scripts/analyze-paper.ts <arxiv-id> [--force]
```

Do not analyze the paper manually in chat.
Do not download the PDF with ad hoc shell commands.
Do not call Claude directly from the mode instructions.
Do not write `analyses/*.md` by hand.

If `scripts/analyze-paper.ts` is missing or broken:
1. Report the problem clearly.
2. Offer to fix the script.
3. Do not replace it with a one-off workaround unless the user explicitly asks.

## Behavior

The script:
1. Looks up the paper in `data/papers.jsonl`.
2. Downloads the PDF to `papers/` if needed.
3. Extracts full text from the downloaded PDF.
4. Calls Claude through the dedicated provider boundary in `scripts/analyze-paper.ts`.
5. Saves the final Markdown analysis to `analyses/<arxiv-id>.md`.
6. Saves audit metadata to `analyses/<arxiv-id>.json`.

Deep analysis is allowed to read the full PDF. Unlike abstract-only evaluation,
this mode may discuss equations, theorems, methods, and results found in the
PDF.

## Safety Rules

- Never change paper status automatically.
- Never archive, dismiss, queue, or mark the paper as read.
- Preserve `data/papers.jsonl`.
- Make clear that the output is based on extracted text from the downloaded PDF.
- If Claude, PDF download, or PDF text extraction fails, surface the error and stop.
- Do not produce a speculative analysis from metadata if full-text extraction fails.
- Do not overwrite an existing analysis unless the user passes `--force`.

## Command

```bash
npx tsx scripts/analyze-paper.ts <arxiv-id>
npx tsx scripts/analyze-paper.ts <arxiv-id> --force

# npm shortcut
npm run analyze -- <arxiv-id>
npm run analyze -- <arxiv-id> --force
```

## TUI

Inside the TUI, pressing `A` on the selected paper MUST invoke:

```bash
npx tsx scripts/analyze-paper.ts <selected-arxiv-id>
```

The TUI should display command progress and failures in the log panel.
