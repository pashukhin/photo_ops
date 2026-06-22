# AGENTS.md

## Project State

PhotoOps has completed:

- Session 001: architecture frame.
- Session 002: executable upload/list scaffold.
- Session 003: identity, sessions, and authenticated upload ownership.
- Session I: fortification review and guardrail consolidation.

The current executable frame ends with authenticated upload/list. The full MVP still ends with a published public photo story.

Before implementing, read:

- `README.md`
- `project_description.md`
- `docs/fortification-review.md`
- `docs/domain-model.md`
- `docs/e2e-auth-upload-ownership.md`
- the accepted spec and plan for the target session

## Current Implementation Baseline

The current working path is:

```text
web -> api-gateway -> identity-service + photo-service -> MinIO + identity-db + photo-db -> web
```

The user-visible baseline is: open UI, sign up or log in, upload a JPEG through presigned MinIO PUT, complete upload, and see only that user's photo listed with status `uploaded`.

## Fortification Guardrails

- Do not add EXIF, previews, clustering, publication, usage ledger, connectors, or media processing unless the current approved session explicitly targets them.
- Prefer one canonical workflow over multiple equivalent commands.
- Document retained imperfections as trade-offs, deferred work, or follow-up issues.
- Cheap fixes are allowed when they reduce development friction or risk without changing product scope.
- If a change touches service ownership, database ownership, auth/session behavior, MinIO object privacy, or browser-to-service boundaries, treat it as architecture-sensitive and verify against the accepted specs.

## Architecture Rules

- Keep the current frame scoped to authenticated upload/list; do not implement EXIF, previews, clustering, publication, usage aggregation, or connectors unless explicitly requested.
- `web` talks only to `api-gateway`, except for presigned MinIO upload URLs.
- `api-gateway` must not connect to any database.
- `photo-service` owns `photo-db` and the photo upload/list domain.
- Data-owning services use separate databases. A service must connect only to its own DB.
- Cross-service references use UUID v7.
- Non-photo and non-identity services are health-only scaffolds in the current frame; their gRPC contracts may exist without wired servers.
- Prefer preserving the authenticated JPEG upload/list baseline over polishing scaffolding.

## Contract And Runtime Rules

- Sync service contracts are proto-first.
- Use RabbitMQ for async workflows later; do not invent async contracts before they are needed.
- Keep MinIO object keys server-generated and independent from raw filenames.
- Originals are private; public delivery uses prepared variants in later stages.

## Workflow Rules

- Follow the implementation plan task-by-task.
- Do not use git worktrees in this project; they conflict with the beads workflow. Use regular git feature branches with `git switch -c` instead.
- Before implementation starts, write the manual e2e scenario for the target change and get it approved. This keeps the team explicit about what behavior is being built and reviewed.
- Keep commits small and aligned with plan tasks.
- Before each commit, inspect `git status`, `git diff`, and recent log.
- Do not commit unrelated files.
- Verify claims with commands before reporting success.
- If framework tooling disagrees with snippets in the plan, make the smallest working adjustment and keep the documented architecture boundary intact.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
