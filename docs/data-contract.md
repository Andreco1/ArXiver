# Data Contract

## Paper 

Stored in `data/papers.jsonl`, one JSON object per line.

```json 
{
  "id": "2601.12345", 
  "title": "Paper title",
  "authors": ["Author One", "Author Two"],
  "abstract": "Abstract text",
  "categories": ["cs.LG", "cs.AI"],
  "primary_category": "cs.LG",
  "published_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-01-02T00:00:00Z",
  "arxiv_url": "https://arxiv.org/abs/2601.12345",
  "pdf_url": "https://arxhiv.org/pdf/2601.12345",
  "status": "new",
  "created_at": "2026-01-02T10:00:00Z",
  "updated_local_at": "2026-01-02T10:00:00Z"
}
```

## Status

Allowed values:

- new 
- recommended 
- queued
- reading
- read 
- archived
- dismissed

Only the human may move papers to:

- read 
- archived 
- dismissed
