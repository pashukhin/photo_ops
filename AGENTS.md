# AGENTS.md

## Required Reading

Before implementing, read:

- `README.md`
- `project_description.md`
- `docs/fortification-review.md`
- `docs/domain-model.md`
- `docs/e2e-auth-upload-ownership.md`
- the accepted spec and plan for the target session

## Scope Guardrails

- Do not add EXIF, previews, clustering, publication, usage ledger, connectors, or media processing unless the current approved session explicitly targets them.
- Keep changes aligned with the accepted spec and plan for the active session.
- Prefer simplification over sophistication.
- Prefer one canonical workflow over multiple equivalent commands.
- Document retained imperfections as trade-offs, deferred work, or follow-up issues.
- Cheap fixes are allowed when they reduce development friction or risk without changing product scope.
- Preserve the authenticated JPEG upload/list baseline unless the active session explicitly changes it.

## Architecture Rules

- `web` talks only to `api-gateway`, except for presigned MinIO upload URLs.
- `api-gateway` must not connect to any database.
- `photo-service` owns `photo-db` and the photo upload/list domain.
- `identity-service` owns `identity-db`, users, credentials, and sessions.
- Data-owning services use separate databases. A service must connect only to its own DB.
- Cross-service references use UUID v7.
- Non-photo and non-identity services are health-only scaffolds until their approved sessions wire real behavior.
- If a change touches service ownership, database ownership, auth/session behavior, MinIO object privacy, or browser-to-service boundaries, treat it as architecture-sensitive and verify against the accepted specs.

## Contract And Runtime Rules

- Sync service contracts are proto-first.
- Use RabbitMQ for async workflows later; do not invent async contracts before they are needed.
- Keep MinIO object keys server-generated and independent from raw filenames.
- Originals are private; public delivery uses prepared variants in later stages.

## Workflow Rules

- Use `bd` for all task tracking. Do not use markdown TODO lists, TodoWrite, or TaskCreate for project task tracking.
- Run `bd prime` for detailed beads workflow context at the start of a session.
- Work in a regular git feature/session branch for each session.
- Do not use git worktrees in this project; they conflict with the beads workflow.
- Prefer running project commands through `Makefile` targets when a suitable target exists.
- Before implementation starts, write the manual e2e scenario for the target change and get it approved.
- Follow the accepted implementation plan task-by-task.
- Keep commits small and aligned with plan tasks.
- Before each commit, inspect `git status`, `git diff`, and recent log.
- Do not commit unrelated files.
- Verify claims with commands before reporting success.
- If framework tooling disagrees with snippets in the plan, make the smallest working adjustment and keep the documented architecture boundary intact.
- At session handoff, summarize what changed, verification results, follow-up issues, branch name, and push status.

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

- Use `bd` for ALL task tracking.
- Run `bd prime` for detailed command reference and session close protocol.
- Use `bd remember` for persistent knowledge; do not use MEMORY.md files.

## Session Completion

When ending a work session, complete all steps below. Work is not complete until `git push` succeeds.

1. File issues for remaining work.
2. Run quality gates if code changed.
3. Update issue status.
4. Push beads and git state:

```bash
git pull --rebase
bd dolt push
git push
git status
```

5. Verify all changes are committed and pushed.
6. Hand off with concise context for the next session.

Critical rules:

- Never stop before pushing completed session work.
- Never say "ready to push when you are"; push the work.
- If push fails, resolve and retry until it succeeds.
