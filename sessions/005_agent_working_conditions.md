# Session 005: Agent Working Conditions

This is an agent working-conditions session, not a product feature session. The goal was to make it cheaper for a future AI agent to develop and maintain the project — by putting durable knowledge next to the code and defining an explicit model for where each kind of knowledge lives. No product features were added.

## Goal

After Sessions 001–003 (architecture frame, executable upload/list scaffold, identity and authenticated upload ownership) and Session 004 (fortification review), the codebase lacked a systematic answer to: _where does an agent look for project knowledge, and where does it write new knowledge?_ This session created that answer.

The secondary goal was to research external agent-tooling options (code-navigation MCP servers) and file pilot issues — without adopting anything yet.

## What Changed

### Knowledge model

An explicit knowledge-placement policy was added to `AGENTS.md`. It defines which kinds of knowledge live in `AGENTS.md`, root `CLAUDE.md`, nested `CLAUDE.md` files, `bd remember`, `docs/`, and `sessions/` — and who writes/reads each. This is the core artifact of the session.

### Canonical `AGENTS.md` and slim root `CLAUDE.md`

`AGENTS.md` became the single canonical source of agent working rules. A freshness discipline rule was added: when an agent changes code that a `CLAUDE.md` describes, it must update that file in the same commit. Root `CLAUDE.md` was slimmed to a thin Claude Code pointer; all rules content lives in `AGENTS.md`.

### Hierarchical `CLAUDE.md` — real service units

Seven real service units received a two-section `CLAUDE.md` (`## Local context` / `## Local invariants`):

- `apps/api-gateway/CLAUDE.md`
- `apps/identity-service/CLAUDE.md`
- `apps/photo-service/CLAUDE.md`
- `apps/web/CLAUDE.md`
- `proto/CLAUDE.md`
- `packages/proto-ts/CLAUDE.md`
- `infra/docker/CLAUDE.md`

### Hierarchical `CLAUDE.md` — scaffold stubs

Five scaffold services received minimal stub `CLAUDE.md` files (shape only, no local context yet):

- `apps/cluster-service/CLAUDE.md`
- `apps/media-worker/CLAUDE.md`
- `apps/connector-service/CLAUDE.md`
- `apps/publication-service/CLAUDE.md`
- `apps/usage-service/CLAUDE.md`

### `sessions/README.md` — session-numbering doc

`sessions/README.md` was created documenting the flat, sequential session-numbering convention (`001`, `002`, … in chronological order; the descriptive filename carries the session's purpose). An earlier three-scheme proposal (`NNN`/`00i`/`00a`) was made and then reversed within this session — it broke chronological ordering and added rules for no real gain; the prior review brief was renumbered `00i` → `004` accordingly.

### ADR-0002: toolchain pinning with mise

`docs/adr/0002-toolchain-pinning-with-mise.md` records the decision to use mise for toolchain version pinning: pin node, pnpm, go, python via mise; buf stays a pnpm devDependency.

### `bd remember` seeds

Three durable decisions were seeded into the beads knowledge store:

1. `photoops-knowledge-placement` — knowledge-placement model (which kind of knowledge lives where: `AGENTS.md`, root `CLAUDE.md`, nested `CLAUDE.md` files, `bd remember`, `docs/`, `sessions/`).
2. `photoops-toolchain-mise` — mise toolchain-pinning decision (ADR-0002): pin node/pnpm/go/python via mise; buf stays a pnpm devDependency.
3. `photoops-prioritization-now-vs-deferred` — now-vs-deferred prioritization principle: finish the current increment before deferring.

(An earlier `photoops-session-numbering` seed was created and then removed when the three-scheme numbering was reversed in favor of flat sequential numbering — the convention is now self-evident from `sessions/README.md` and does not need a memory.)

### Agent-tooling research report

`docs/agent-tooling-research.md` contains an evaluation-only report on code-navigation MCP servers: codebase-memory-mcp and Serena were shortlisted. No tools were adopted; two follow-up pilot issues were filed.

## `make test` Verification

Command: `make test`

Result: **PASS** — all 39 unit tests across `apps/api-gateway` (15 tests, 5 files), `apps/photo-service` (8 tests, 3 files), `apps/identity-service` (10 tests, 3 files), and `apps/web` (6 tests, 2 files) passed. Scaffold services exited 0. Smoke upload contract script passed. This session changed only documentation (`docs/`, `AGENTS.md`, `CLAUDE.md` files); no application code was modified.

## Follow-up Issues Filed (Task 8)

- `photo_ops-cdk` (P3) — Evaluate adopting codebase-memory-mcp for code navigation. Pilot on existing TS services first; decide before wiring into agent workflow.
- `photo_ops-02q` (P3) — Evaluate adopting Serena for code navigation. LSP-backed MCP server with TS/Go/Python support; pilot on existing TS services; Buf LSP can fill proto gap.

## Branch

`session-005-agent-working-conditions`

## Deliverables Checklist

- [x] Knowledge-placement policy added to `AGENTS.md`
- [x] Freshness discipline rule added to `AGENTS.md`
- [x] Root `CLAUDE.md` slimmed to thin Claude Code pointer
- [x] Nested `CLAUDE.md` (two-section) for seven real service units
- [x] Nested `CLAUDE.md` stubs for five scaffold services
- [x] `sessions/README.md` — session-numbering doc
- [x] `docs/adr/0002-toolchain-pinning-with-mise.md` — ADR-0002
- [x] Three `bd remember` seeds
- [x] `docs/agent-tooling-research.md` — agent-tooling evaluation report
- [x] `photo_ops-cdk` follow-up pilot issue filed
- [x] `photo_ops-02q` follow-up pilot issue filed
- [x] `make test` passes (PASS, 39 tests)
- [x] Session brief (`sessions/005_agent_working_conditions.md`)
- [x] `README.md` updated

## Session Extension (in-session ergonomics improvements)

After the core deliverables, the session was extended with further agent-ergonomics work:

- **Settings & junk hygiene** — `.claude/settings.json` reduced to reusable project permissions (`bd:*`, safe `make` targets, smoke scripts) + `bd prime` hooks; `.claude/settings.local.json` and `.vscode/` gitignored; empty `.worktrees/` removed.
- **Flat session numbering** — the three-scheme (`NNN`/`00i`/`00a`) numbering introduced earlier this session was reversed to one flat chronological sequence (`00i`→`004`, `00a`→`005`); the `photoops-session-numbering` memory was forgotten as self-evident.
- **Claude Code practices** — researched official best practices; recorded adoption decisions in `docs/claude-code-practices.md`. Key reframing: slash commands are a *user* convenience, not an *agent*-ergonomics lever, so repeatable workflows are encoded as CLAUDE.md/AGENTS.md instructions instead (proto-drift habit added to `proto/CLAUDE.md`).
- **Deferred follow-ups filed** — `photo_ops-0wa` (evaluate custom subagents) and `photo_ops-8d5` (PostToolUse quality-gate hook, blocked on `photo_ops-p8y`).

## Next Step

Return to the product path — the next meaningful layer (EXIF/metadata extraction or preview generation) in a separate product session, without disturbing the service boundaries and guardrails established in this and prior sessions.
