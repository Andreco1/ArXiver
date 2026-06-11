# Preview Mode

Goal: generate a local HTML preview for an existing paper analysis with Markdown
and LaTeX rendered.

Inputs:
- `analyses/<arxiv-id>.md`

Outputs:
- `previews/<arxiv-id>.html`

## Required Implementation

The preview workflow MUST use the repository script:

```bash
npx tsx scripts/generate-preview.ts <arxiv-id> [--open]
```

Do not generate preview HTML manually in chat.
Do not call an LLM.
Do not modify `data/papers.jsonl`.

If `scripts/generate-preview.ts` is missing or broken:
1. Report the problem clearly.
2. Offer to fix the script.
3. Do not replace it with ad hoc HTML generation unless the user explicitly asks.

## Behavior

The script:
1. Reads `analyses/<arxiv-id>.md`.
2. Converts Markdown to HTML.
3. Renders inline and display LaTeX with KaTeX.
4. Writes `previews/<arxiv-id>.html`.
5. Opens the preview in the default browser when `--open` is passed.

The preview is local and uses the project dependency at
`node_modules/katex/dist/katex.min.css`.

## Command

```bash
npx tsx scripts/generate-preview.ts <arxiv-id>
npx tsx scripts/generate-preview.ts <arxiv-id> --open

# npm shortcut
npm run preview -- <arxiv-id>
npm run preview -- <arxiv-id> --open
```
