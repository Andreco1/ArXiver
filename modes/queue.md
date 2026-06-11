# Queue Mode

Goal: manage the reading queue for evaluated papers.

Inputs:
- `data/papers.jsonl`

Rules:
- No LLM call.
- Never modify paper statuses automatically.
- Human approval is required for every status change.
- Preserve all existing paper fields.
- Update data atomically.

## Required Implementation

The queue workflow MUST be executed with:

```
npx tsx scripts/manage-queue.ts <command>
```

- Do not manually edit `data/papers.jsonl`.
- Do not call an LLM.
- Do not use ad hoc shell, Python, or curl to change statuses.
- Every status change requires an explicit user command.

If `scripts/manage-queue.ts` is missing or broken:
1. Report the problem clearly.
2. Offer to fix the script.
3. Do not apply status changes manually.

## Commands

```bash
# List evaluated papers (sorted by score)
npx tsx scripts/manage-queue.ts list

# Filter by status
npx tsx scripts/manage-queue.ts list --status queued
npx tsx scripts/manage-queue.ts list --status reading

# Filter by recommendation
npx tsx scripts/manage-queue.ts list --recommendation must_read

# Limit results
npx tsx scripts/manage-queue.ts list --limit 10

# Queue a paper for reading
npx tsx scripts/manage-queue.ts queue <arxiv-id>

# Mark as currently reading
npx tsx scripts/manage-queue.ts reading <arxiv-id>

# Mark as read
npx tsx scripts/manage-queue.ts read <arxiv-id>

# Archive
npx tsx scripts/manage-queue.ts archive <arxiv-id>

# Dismiss
npx tsx scripts/manage-queue.ts dismiss <arxiv-id>
```

Allowed statuses: `new` | `recommended` | `queued` | `reading` | `read` | `archived` | `dismissed`

After running a status command:
1. Confirm the paper ID and old → new status.
2. Do not chain further status changes without user approval.
