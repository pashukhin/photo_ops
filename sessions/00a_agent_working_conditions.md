# Session 00a: Agent Working Conditions

This is an agent working-conditions session (scheme `00a`), not a product feature session. The goal was to make it cheaper for a future AI agent to develop and maintain the project — by putting durable knowledge next to the code and defining an explicit model for where each kind of knowledge lives. No product features were added.

## Goal

After Sessions 001–003 (architecture frame, executable upload/list scaffold, identity and authenticated upload ownership) and Session I (fortification review), the codebase lacked a systematic answer to: _where does an agent look for project knowledge, and where does it write new knowledge?_ This session created that answer.

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

`sessions/README.md` was created documenting the three session-numbering schemes: `NNN` (product), `00i` (review/consolidation), `00a` (agent working conditions).

### ADR-0002: toolchain pinning with mise

`docs/adr/0002-toolchain-pinning-with-mise.md` records the decision to use mise for toolchain version pinning (Node, pnpm, Go, Python, Buf, protoc-gen-go) as the standard approach going forward.

### `bd remember` seeds

Four durable decisions were seeded into the beads knowledge store:

1. Knowledge-placement policy (where each kind of knowledge lives).
2. Proto-first contract rule (protos are contracts; never edit generated TypeScript directly).
3. Ownership boundaries (service ↔ database ownership policy).
4. Session-numbering schemes.

### Agent-tooling research report

`docs/agent-tooling-research.md` contains an evaluation-only report on code-navigation MCP servers: codebase-memory-mcp and Serena were shortlisted. No tools were adopted; two follow-up pilot issues were filed.

## `make test` Verification

Command: `make test`

Result: **PASS** — all 39 unit tests across `apps/api-gateway` (15 tests, 5 files), `apps/photo-service` (8 tests, 3 files), `apps/identity-service` (10 tests, 3 files), and `apps/web` (6 tests, 2 files) passed. Scaffold services exited 0. Smoke upload contract script passed. This session changed only documentation (`docs/`, `AGENTS.md`, `CLAUDE.md` files); no application code was modified.

## Follow-up Issues Filed (Task 8)

- `photo_ops-cdk` (P3) — Evaluate adopting codebase-memory-mcp for code navigation. Pilot on existing TS services first; decide before wiring into agent workflow.
- `photo_ops-02q` (P3) — Evaluate adopting Serena for code navigation. LSP-backed MCP server with TS/Go/Python support; pilot on existing TS services; Buf LSP can fill proto gap.

## Branch

`session-00a-agent-working-conditions`

## Deliverables Checklist

- [x] Knowledge-placement policy added to `AGENTS.md`
- [x] Freshness discipline rule added to `AGENTS.md`
- [x] Root `CLAUDE.md` slimmed to thin Claude Code pointer
- [x] Nested `CLAUDE.md` (two-section) for seven real service units
- [x] Nested `CLAUDE.md` stubs for five scaffold services
- [x] `sessions/README.md` — session-numbering doc
- [x] `docs/adr/0002-toolchain-pinning-with-mise.md` — ADR-0002
- [x] Four `bd remember` seeds
- [x] `docs/agent-tooling-research.md` — agent-tooling evaluation report
- [x] `photo_ops-cdk` follow-up pilot issue filed
- [x] `photo_ops-02q` follow-up pilot issue filed
- [x] `make test` passes (PASS, 39 tests)
- [x] Session brief (`sessions/00a_agent_working_conditions.md`)
- [x] `README.md` updated

## Next Step

Return to the product path — the next meaningful layer (EXIF/metadata extraction or preview generation) in a separate product session, without disturbing the service boundaries and guardrails established in this and prior sessions.
