# Evaluation Contract 

The evaluator must return valid JSON.

## Evaluation

```json
{
    "paper_id": "2601.12345",
    "basis": "metadata_and_abstract",
    "scores": {
        "novelty": 1,
        "open_problem_fit": 1,
        "methodological_relevance": 1,
        "result_importance": 1,
        "readability": 1
    },
    "total_score": 1,
    "recommendation": "ignore_for_now",
    "rationale": "",
    "key_claims": [],
    "why_read": "",
    "why_skip": "",
    "suggested_first_read": []
}
```

Allowed recommendations:

- must_read
- skim
- maybe
- ignore_for_now 

Rules:

- Scores must be numbers from 1 to 5.
- tota_score must match the configured weighted score.
- Do not claim to have read the PDF.
- Do not mention equations unless they appear in the abstract.
- If evidence is weak, say so.