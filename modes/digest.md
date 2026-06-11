# Digest Mode

Goal: generate a Markdown digest of evaluated papers for a given day.

Inputs:
- `data/papers.jsonl`
- `reports/<paper-id>.md` (linked when available)

Output:
- `digests/YYYY-MM-DD.md`

Rules:
- Only papers with an `evaluation` field are included.
- Papers are grouped by recommendation and sorted by score descending within each group.
- No LLM call — deterministic Markdown only.
- Never modify paper data or statuses.

## Required Implementation

The digest workflow MUST be executed with:

```
npx tsx scripts/generate-digest.ts
```

- Do not generate Markdown digests manually or inline.
- Do not call an LLM.
- Do not parse `data/papers.jsonl` with ad hoc shell, Python, or curl.
- Do not modify paper statuses or evaluation data.

If `scripts/generate-digest.ts` is missing or broken:
1. Report the problem clearly.
2. Offer to fix the script.
3. Do not replace it with inline generation logic.

## Command

```bash
# Digest for today (default)
npx tsx scripts/generate-digest.ts

# Digest for a specific date
npx tsx scripts/generate-digest.ts --date 2026-06-10

# Digest for all evaluated papers
npx tsx scripts/generate-digest.ts --all

# npm shortcut
npm run digest
```

After running:
1. Report the digest path.
2. Summarize the counts per recommendation group.
3. Do not modify any paper statuses.
