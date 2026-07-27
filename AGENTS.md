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

- Use **mtt** for all task tracking (see "Working under mtt" below). Do not use markdown TODO lists, TodoWrite, or TaskCreate.
- Run `mtt roadmap` (what's next) and `mtt prime` (curated KB) at the start of a session.
- **Branch model (End-state 1):** each change rides its own `task/<id>` branch off `main` → one squash-merged PR (title `<id>: …`) → `mtt deliver`. An mtt **story** is the coherence node (holds the spec/e2e/ADR; no branch); a "session" is at most a milestone tag. The flow's edges create/switch these branches for you.
- Do not use git worktrees in this project.
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
- At session handoff, summarize what changed, verification results, follow-up mtt tasks, branch/PR, and push status.
- Historical session briefs under `sessions/` are archival (pre-mtt); new work is scoped by an mtt **story**, not a session brief.
- The four gate rules below form an **automated gate tier** around the skeleton→GREEN flow — now **mechanized as mtt flow-edge gates** (`.mtt/config.yaml`), so a change cannot reach `done` without them. Rationale + composition + what was deliberately *not* built: `docs/agent-workflow-evolution.md` Decision 7.
- **Coverage gates (q2n):** run `make skeleton-gate` before handing a skeleton to human review; if it fails, the skeleton is NOT review-ready — return to author to add the missing RED test (spec-change protocol applies). Run `make coverage-gate` before final branch review / merge (also enforced by the CI `coverage-gate` job on PRs). Both gates require 100% new/changed-code coverage; override with `COVERAGE_FAIL_UNDER=<n>`. Design: `docs/superpowers/specs/2026-07-02-coverage-gate-design.md`.
- **Test-integrity guard (mp0):** removing or renaming-away a test declaration, or deleting a test file, requires an `Allow-test-removal: <reason>` trailer on the commit that does it. `make test-guard` enforces this (also a CI PR job). Design: `docs/superpowers/specs/2026-07-02-test-integrity-guard-design.md`.
- **Edit-time lint hook (8d5):** a `PostToolUse` (Write|Edit) hook `scripts/lint-changed` lints the just-edited file (eslint / ruff-in-media-worker / gofmt) and feeds issues back for a quick fix; it is advisory (`make gate` is authoritative). Disable a session with `LINT_HOOK=0`. Loads at session start. Design: `docs/superpowers/specs/2026-07-02-lint-hook-design.md`.
- **Executable e2e/smoke where applicable (dqb):** when a change is user-facing or crosses an integration boundary — UI render, HTTP↔gRPC, message broker (AMQP), storage (Postgres/MinIO), or a cross-service flow — the skeleton/plan MUST include an executable e2e/smoke on a live stack (an existing `make smoke-*` — `smoke-ui`/`smoke-stack`/`smoke-usage`/`smoke-upload`/… — or a new one), and it MUST be run green before the final branch review / merge. Rationale: unit/jsdom/mock tests share the code's assumptions and miss render/integration bugs (s008: 3 real bugs only the live smoke caught; s011: `make smoke-ui`). Applicability gate — EXEMPT: pure-internal / library / refactor changes with no boundary crossing (unit tests suffice).

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
- Every commit you author by hand must end with the `Co-Authored-By` trailer (a
  convention; there are no git hooks — beads' `prepare-commit-msg`/`pre-commit`
  were removed at the mtt migration). mtt's own `.mtt` machine-commits are exempt.
- Capture a new task id with `mtt add … --json | jq -r .id`, not by grepping the
  human output.
- Rely on the Bash tool's built-in output truncation; add `| tail`/`head` only
  for genuinely unbounded streams.
- Verify tree assumptions with a command over the whole repo, not by eye on a
  partial subtree (e.g. tests and `package.json` may live outside `src/`).

## Knowledge Placement

Write durable knowledge in the right place so the next agent can find it:

| Kind of knowledge | Lives in |
| --- | --- |
| Agent working rules & guardrails (canonical, cross-tool) | `AGENTS.md` (this file) |
| Claude Code specifics + pointer | root `CLAUDE.md` |
| Local code context + local invariants | nested `CLAUDE.md` (`## Local context` / `## Local invariants`) |
| Durable facts/decisions not tied to a file | `mtt note add` (browse `mtt note list`; `mtt prime` surfaces the important ones) |
| Decisions with rationale / per-session design | `docs/adr`, `docs/superpowers/specs` & `plans` |

Nested `CLAUDE.md` files exist for real services and key directories
(`apps/api-gateway`, `apps/identity-service`, `apps/photo-service`, `apps/web`,
`proto/`, `infra/docker/`, `packages/proto-ts`). Scaffold services carry a
one-line stub until they gain real behavior.

## Session Completion

Under mtt, each change delivers via its own `task/<id>` PR (squash-merged to `main`, then `mtt deliver`). Work is not complete until `git push` succeeds. At the end of a working session:

1. File remaining work as mtt tasks (`mtt add`).
2. Run `make gate` if code changed (the flow gates enforce it on `submit`; re-run before handoff).
3. Leave every in-flight task at a coherent status — advance or `mtt decline` it; never hand-edit `.mtt`.
4. Push git state (a `deliver` lands its `.mtt` done-commit on `main`):

```bash
git status
git push
```

5. Verify all changes are committed and pushed.
6. Hand off with concise context for the next session.

Critical rules:

- Never stop before pushing completed session work.
- Never say "ready to push when you are"; push the work.
- If push fails, resolve and retry until it succeeds.

<!-- mtt:begin -->
## Working under mtt

This project tracks its tasks and workflow in **mtt** — a local, file-backed task **state machine**. You do
work by moving a task through its type's flow; each transition can run **gate commands that BLOCK the move on
failure**, so "done" means the checks passed.

**Discover THIS project's flow (don't assume it):**
- `mtt roadmap` — what to work on next (dependency + priority order).
- `mtt ready` — tasks that are unblocked and can be started.
- `mtt types` — the task types with their statuses, transitions, and gate commands (the Definition of Done).
- `mtt show <id>` — a task's details, current status, and the exact next moves available from here.

**The work loop:**
1. Pick a task from `mtt roadmap`.
2. Take it into work using the flow's first move (see the `next:` line in `mtt show <id>` for the exact verb).
3. Do the work, then advance with `mtt <status> <id>` or `mtt <edge> <id>` — one of the moves `mtt show`
   lists. A transition's gate commands run first and BLOCK the move if any fails; read the guidance printed on
   each move.
4. Close a task only by reaching a terminal status through a flow edge. Never delete a task to "finish" it.

**Attribution:** every move records who made it. Set `author:` once in `.mtt/config.local.yaml` (personal,
gitignored), or pass `--who <you>`. Record a reason with `--why "<why>"`; the project may **require** who/why
on some moves and always on dangerous operations (a forced delete, a gate bypass) — mtt tells you when.

**Storage:** `.mtt/` is committed project data. Task files are written **only** by mtt — never hand-edit them;
use `mtt add` / `mtt edit` / the flow moves, and mtt keeps history and determinism.

**Knowledge:** record durable decisions and lessons with `mtt note add`; `mtt prime` prints the important
notes — wire it into your agent's session start.

Run `mtt --help` or `mtt <command> --help` for the full surface. This section is scaffolded by
`mtt agent docs` and is regenerated on re-run — put your own notes OUTSIDE the mtt:begin/mtt:end markers.
<!-- mtt:end -->
