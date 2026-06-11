# Doctor Mode

Goal: validate that ArXiver is configured and safe to run.

Inputs:
- `config/profile.yml`
- `config/scoring.yml`
- `config/sources.yml`
- `.gitignore`
- local command availability

## Required Implementation

The doctor workflow MUST use the repository script:

```bash
npx tsx scripts/doctor.ts
```

Do not inspect configuration manually in chat unless the script reports a
specific problem that needs debugging.

If `scripts/doctor.ts` is missing or broken:
1. Report the problem clearly.
2. Offer to fix the script.
3. Do not replace it with ad hoc checks unless the user explicitly asks.

## Checks

The script should verify:
- required config files exist
- config YAML parses correctly
- scoring weights are valid
- arXiv categories are configured
- local/private directories are ignored by git
- Claude CLI is available when using Claude-backed workflows
- generated-data directories are present or can be created by workflows

## Command

```bash
npx tsx scripts/doctor.ts

# npm shortcut
npm run doctor
```
