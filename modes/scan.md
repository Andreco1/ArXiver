# Scan Mode 

Goal: find recent arXiv papers from configured categories.

Inputs: 
- config/sources.yml
- config/profile.yml 

Output:
- data/papers.jsonl 

Process:
1. Read configured arXiv categories.
2. Fetch recent papers from arXiv.
3. Normalize metadata.
4. Deduplicate by arXiv ID.
5. Add new papers with status `new`.
6. Do not evaluate papers in scan mode.

## Required Implementation

The scan workflow MUST be executed with:

```
npx tsx scripts/scan-arxiv.ts
```

- Do not manually call `curl`.
- Do not parse arXiv XML inline.
- Do not use ad hoc Python, shell, or one-off scripts.

If `scripts/scan-arxiv.ts` is missing or broken:
1. Report the problem clearly.
2. Offer to fix the script.
3. Do not replace it with inline scraping logic.
