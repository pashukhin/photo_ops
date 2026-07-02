# Edit-time lint hook (8d5) — design note (thin, exSDD lane)

Date: 2026-07-02 · Issue: `photo_ops-8d5` · Branch: `feat/test-gates`

> **Why thin.** Harness config + a small dispatch script. The real spec is the
> `linter_for` unit tests + the hook smoke; this note is intent + decisions +
> layer-routing + entry-points.

## Intent

A Claude Code `PostToolUse` hook (matcher `Write|Edit`) runs a **fast, per-file**
linter on the just-edited file and surfaces issues to the agent as **actionable
feedback** (exit 2) — fast edit-time feedback so lint issues are fixed at write
time, not deferred to `make gate`. `make gate` remains the correctness authority
(Decision 5, agent-workflow-evolution). Blockers p8y/yl7 are closed.

## Decisions (from brainstorm 2026-07-02)

- **Polyglot fast linters, by changed-file suffix:**
  - `*.ts`/`*.tsx` → `pnpm exec eslint <file>` (flat config).
  - `*.py` UNDER `apps/media-worker/` → `apps/media-worker/.venv/bin/ruff check <file>`; other `.py` (e.g. `scripts/*`) → **skip** (no configured ruff there — avoids noise).
  - `*.go` → `gofmt -l`/`-d <file>` (formatting only).
- **Excluded (too slow / whole-project):** `tsc`, `mypy`, `golangci-lint`, full `make gate`.
- **Loudness:** issues found → print to stderr + **exit 2** (agent sees + fixes). Clean / unknown suffix / file outside repo → **exit 0** (silent).
- **Escape valve:** `LINT_HOOK=0` env (session opt-out, no tracked-file churn) + removing the hook from settings.json. No auto-fix (would silently mutate the agent's just-written file).
- **Loads next session:** settings hooks are read at session start — the hook takes effect in the NEXT session, not the current one.

## Layer routing (each fact in its cheapest fail-on-drift home)

| Layer | Home |
| --- | --- |
| suffix → linter command (+ ruff media-worker scope, skip rules) | `linter_for(path) -> list[str] | None` — pure, unit-tested |
| stdin hook-JSON parse + subprocess run + exit-code mapping + `LINT_HOOK` guard | `scripts/lint-changed` (python3 orchestrator) |
| End-to-end: issue→exit2+stderr; clean→exit0; `LINT_HOOK=0`→exit0; unknown→exit0 | `scripts/linthook/tests` smoke/integration |
| Hook wiring (PostToolUse `Write|Edit` → `scripts/lint-changed`) | `.claude/settings.json` |
| Why / non-goals | this note + the `8d5` issue + Decision 5 |

## Entry points

- `scripts/lint-changed` — executable python3 (stdlib `json`/`subprocess`): read `tool_input.file_path` from stdin, `LINT_HOOK` guard, dispatch via `linter_for`, run it, exit 2 with output on issues else 0.
- The pure `linter_for` + its unit tests (co-located, run via the existing `scripts/coverage/.venv` pytest).
- `.claude/settings.json` — a `PostToolUse` entry (matcher `Write|Edit`).

## Error handling / edge cases

- Missing/unparseable stdin, no `file_path`, file outside repo, unknown suffix → exit 0 (never block on the hook's own confusion).
- A linter tool absent (e.g. media-worker venv not built) → skip that file with exit 0 (don't punish edits for a missing dev tool); optionally a one-line stderr note.
- Must stay fast (single file); never run whole-project or `make gate`.

## Non-goals (negative space)

- NOT `tsc`/`mypy`/`golangci-lint`/`make gate` (slow / whole-project) — those stay in `make gate` / CI.
- NOT auto-fix (`eslint --fix`/`gofmt -w`) — no silent mutation of just-written files.
- NOT a correctness gate (advisory only; `make gate` is authoritative).
- Non-media-worker `.py` files are not linted (no configured ruff there).
