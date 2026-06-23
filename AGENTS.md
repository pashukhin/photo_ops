# AGENTS.md

This file defines how coding agents work on this project. It is a guardrail, not a project description. For what the project is and how it is built, read the documents below.

## Required Reading

Before implementing, read:

- `README.md`
- `project_description.md`
- `docs/architecture.md`
- `docs/domain-model.md`
- the accepted spec, plan, and e2e scenario for the active session

## Scope Guardrails

- Stay within what the current approved session targets; do not add product features beyond it.
- Keep changes aligned with the accepted spec and plan for the active session.
- Do not regress existing working behavior unless the active session explicitly changes it.
- Prefer simplification over sophistication.
- Prefer one canonical workflow over multiple equivalent commands.
- Document retained imperfections as trade-offs, deferred work, or follow-up issues.
- Cheap fixes are allowed when they reduce development friction or risk without changing product scope.

## Architecture-Sensitive Changes

- The durable architecture and contract boundaries live in `docs/architecture.md`. Keep changes consistent with them.
- If a change touches service ownership, database ownership, auth/session behavior, MinIO object privacy, browser-to-service boundaries, or service contracts, treat it as architecture-sensitive and verify against the accepted specs.
- If framework tooling disagrees with snippets in the plan, make the smallest working adjustment and keep the documented architecture boundary intact.

## Workflow Rules

- Use `bd` for all task tracking. Do not use markdown TODO lists, TodoWrite, or TaskCreate for project task tracking.
- Run `bd prime` for detailed beads workflow context at the start of a session.
- Work in a regular git feature/session branch for each session.
- Do not use git worktrees in this project; they conflict with the beads workflow.
- Prefer running project commands through `Makefile` targets when a suitable target exists.
- Before implementation starts, write the manual e2e scenario for the target change and get it approved.
- Follow the accepted implementation plan task-by-task.
- Keep commits small and aligned with plan tasks.
- When you change a unit of code, re-verify and update that unit's `CLAUDE.md`
  in the same commit. There is no automated staleness check; keeping nested
  context accurate is a discipline, not a gate.
- Before each commit, inspect `git status`, `git diff`, and recent log.
- Do not commit unrelated files.
- Verify claims with commands before reporting success.
- At session handoff, summarize what changed, verification results, follow-up issues, branch name, and push status.

## Knowledge Placement

Write durable knowledge in the right place so the next agent can find it:

| Kind of knowledge | Lives in |
| --- | --- |
| Agent working rules & guardrails (canonical, cross-tool) | `AGENTS.md` (this file) |
| Claude Code specifics + pointer | root `CLAUDE.md` |
| Local code context + local invariants | nested `CLAUDE.md` (`## Local context` / `## Local invariants`) |
| Durable facts/decisions not tied to a file | `bd remember` (search with `bd memories <kw>`) |
| Decisions with rationale / per-session design | `docs/adr`, `docs/superpowers/specs` & `plans` |

Nested `CLAUDE.md` files exist for real services and key directories
(`apps/api-gateway`, `apps/identity-service`, `apps/photo-service`, `apps/web`,
`proto/`, `infra/docker/`, `packages/proto-ts`). Scaffold services carry a
one-line stub until they gain real behavior.

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
