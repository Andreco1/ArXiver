# Evaluate Mode 

Goal: score papers against the researcher's profile.

Inputs:
- config/profile.yml
- config/scoring.yml
- data/papers.jsonl 

Output:
- reports/<arxiv-id>.md 
- updated paper evaluation fields in data/papers.jsonl 

Scoring dimensions:
- novelty
- open_problem_fit 
- methodological_relevance 
- result_importance 
- readability

Rules:
- Explain every score.
- Prefer concrete evidence from title, abstract, and paper text when available.
- If only metadata is available, say so.
- Never pretend to have read the PDF unless the text was actually extracted.

## Command

```bash
# Evaluate up to 5 new papers (default)
npx tsx scripts/evaluate-papers.ts

# Evaluate up to N papers
npx tsx scripts/evaluate-papers.ts --limit N

# Preview which papers would be evaluated without calling Claude
npx tsx scripts/evaluate-papers.ts --dry-run

# npm shortcut
npm run evaluate
```

Inputs: `config/profile.yml`, `config/scoring.yml`, `data/papers.jsonl`  
Outputs: `reports/<arxiv-id>.md` and updated `evaluation` fields in `data/papers.jsonl`

After running:
1. Report how many papers were evaluated.
2. List each paper ID, score, and recommendation.
3. Note the report paths.
4. Do not modify paper statuses.