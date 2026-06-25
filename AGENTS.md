# AGENTS.md

This file defines how coding agents work on this project. It is a guardrail, not a project description. For what the project is and how it is built, read the documents below.

## Principles

Compass for ambiguous moments; each cashes out into a behavior detailed below or
in `docs/agent-workflow-evolution.md`. They consolidate — not replace — the
operational rules in this file.

1. **Don't reinvent the wheel.** Prefer existing libs/tools/patterns; justify any bespoke build.
2. **Don't argue with reality.** When tooling/tests/runtime disagree with the plan, make the smallest working adjustment and keep the boundary; escalate infra problems, do not self-fix.
3. **Don't plan far ahead.** Ship the thinnest slice; defer work that depends on not-yet-real services.
4. **One canonical way.** One gate, one workflow, one source of truth; no duplicate mechanisms.
5. **Simplicity over sophistication.** Document retained imperfections as trade-offs.
6. **Evidence before claims.** Verify with commands/tests; "feels done" is not done.
7. **No duplicate truth.** Each fact lives in the cheapest artifact that fails when it drifts (types, tests, proto, config); don't state one thought in two places.
8. **Fix cheap things now.** If a problem is cheaply and confidently fixable in ~5 minutes, do it in the next 5 minutes — don't defer it (the bar is cheap *and* confident, not "while I'm here").

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
- Session briefs are numbered sequentially under `sessions/`; name each brief so its purpose is clear (see `sessions/README.md`).

## Agent Ergonomics

Conventions distilled from instrumented session logs (see
`docs/agent-ergonomics.md`). They exist to stop re-deriving the same
one-liners and to avoid wasting the Bash budget.

- Run `make gate` as the canonical local pre-push check; do not re-type the
  sub-targets. It verifies the whole polyglot repo — the TS workspaces
  (`proto-check typecheck lint build test`) plus the Python media-worker
  (`gate-media` = `lint-media-worker test-media-worker`). CI runs the TS and
  media-worker halves as two separate jobs; `make gate` is the single local
  equivalent.
- After a commit, do **not** run `git log -1` / `git rev-parse HEAD` /
  `echo "exit: $?"` to confirm — trust the tool result.
- Every commit must end with the `Co-Authored-By` trailer. This is a
  convention, not a hook: the `prepare-commit-msg` slot is owned by beads
  (`.beads/hooks/*` are marker-managed — do not edit them).
- Capture a new issue id with `bd create --json | jq -r .id`, not by grepping
  the human output.
- Use `scripts/sdd` (repo-root-safe) for SDD brief/package/ledger work; never
  `cd` into the plugin-cache dir to run the bundled scripts (cwd footgun).
- Rely on the Bash tool's built-in output truncation; add `| tail`/`head` only
  for genuinely unbounded streams.
- Verify tree assumptions with a command over the whole repo, not by eye on a
  partial subtree (e.g. tests and `package.json` may live outside `src/`).
- Do not hand-firefight `.beads/issues.jsonl` reorder churn; it is cosmetic and
  `.gitattributes` handles it. Only stage it when `(id, status)` actually changed.

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
2. Run `make gate` if code changed.
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
