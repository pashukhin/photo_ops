# AGENTS.md

## Project State

PhotoOps is at the architecture frame stage. The full MVP ends with a published public photo story, but the first executable frame ends with upload/list only.

Before implementing, read:

- `README.md`
- `project_description.md`
- `docs/superpowers/specs/2026-06-21-photoops-architecture-frame-design.md`
- `docs/superpowers/plans/2026-06-21-architecture-frame-upload-slice.md`

## Current Implementation Target

The next implementation target is the first executable frame:

```text
web -> api-gateway -> photo-service -> MinIO + photo-db -> web
```

The user-visible result must be: open UI, upload a JPEG through presigned MinIO PUT, complete upload, and see the photo listed with status `uploaded`.

## Architecture Rules

- Keep the first frame scoped to upload/list; do not implement EXIF, previews, clustering, publication, usage aggregation, or connectors unless explicitly requested.
- `web` talks only to `api-gateway`, except for presigned MinIO upload URLs.
- `api-gateway` must not connect to any database.
- `photo-service` owns `photo-db` and the photo upload/list domain.
- Data-owning services use separate databases. A service must connect only to its own DB.
- Cross-service references use UUID v7.
- Non-photo services are health-only scaffolds in the first frame; their gRPC contracts may exist without wired servers.
- Prefer getting the first JPEG into the uploaded list over polishing scaffolding.

## Contract And Runtime Rules

- Sync service contracts are proto-first.
- Use RabbitMQ for async workflows later; do not invent async contracts before they are needed.
- Keep MinIO object keys server-generated and independent from raw filenames.
- Originals are private; public delivery uses prepared variants in later stages.

## Workflow Rules

- Follow the implementation plan task-by-task.
- Do not use git worktrees in this project; they conflict with the beads workflow. Use regular git feature branches with `git switch -c` instead.
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
