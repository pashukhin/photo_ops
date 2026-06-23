# Agent Working Conditions — Design (Session 005)

Date: 2026-06-23
Status: Accepted
Beads epic: photo_ops-90c

## Session Type

This is session **005**: an agent working-conditions session — it improves how
effectively an AI agent can develop and maintain the project, and adds no
product features and no quality/observability backlog items.

Sessions are numbered with one flat, chronological sequence; the descriptive
filename carries the session's purpose. (During this session a three-scheme
numbering proposal — `NNN`/`00i`/`00a` — was made and then reversed: it broke
chronological ordering and added rules for no real gain. See
`sessions/README.md`.)

## Goal

Do **not** start closing the quality/observability backlog filed earlier (typecheck, CI, structured logging, etc.). Instead, make that backlog **cheap to close in future sessions without this session's context** — by putting durable project knowledge next to the code and defining an explicit model for where each kind of knowledge lives.

The premise (agreed during brainstorming): the project's technical form is not final — the Go `cluster-service` and Python `media-worker` are still health-only scaffolds. So we invest in agent ergonomics that pay off regardless of future service shape, and defer anything that depends on not-yet-built services.

## Scope

In scope:

1. Knowledge-placement policy.
2. Hierarchical `CLAUDE.md` (two-section) for real services and key directories; stubs for scaffolds.
3. Slim root `CLAUDE.md`; keep `AGENTS.md` as the canonical agent-rules source (dedup).
4. Freshness discipline rule in `AGENTS.md` (no automation).
5. Seed `bd remember` with durable decisions.
6. ADR-0002: toolchain pinning with mise.
7. `sessions/README.md` documenting the flat, sequential session-numbering convention.
8. Agent-tooling research report (evaluation only, with follow-up issues; no adoption).

Out of scope (YAGNI):

- No freshness automation (pre-commit/CI staleness checks).
- No mirrored per-level `AGENTS.md` files.
- No adoption/installation of external agent tooling.
- No work on the existing quality/observability backlog issues.

Optional stretch (only if meaningful context remains at the end of the session): adopt one selected agent tool. Decided live, not committed here.

## Knowledge Model (core artifact)

Explicit policy so a future agent knows where to look and where to write:

| Kind of knowledge | Lives in | Written by / read when |
| --- | --- | --- |
| Agent working rules & guardrails (cross-tool, canonical) | `AGENTS.md` (root) | single source of truth; read at session start |
| Claude Code specifics + pointer to AGENTS.md | `CLAUDE.md` (root, thin) | auto-loaded by Claude Code |
| Local code context + local invariants | nested `CLAUDE.md` (two sections) | next to the code; auto-loaded when working in that subdir |
| Durable facts/decisions not tied to a file location | `bd remember` | searchable via `bd memories <kw>` |
| Decisions with rationale / per-session design | `docs/adr`, `docs/superpowers/specs` & `plans` | at architecture/tooling forks |

## Hierarchical CLAUDE.md

- **Root `CLAUDE.md`** becomes thin: a pointer to `AGENTS.md` (canonical rules) plus only Claude-Code-specific notes. Duplicated beads/session-completion blocks are removed (they live in `AGENTS.md`).
- **Nested `CLAUDE.md`** carries both functions via explicit sections:
  - `## Local context` — what this unit does, key files, how to run/test it, gotchas.
  - `## Local invariants` — boundary rules that apply specifically here (e.g. `photo-service` owns `photo-db`; originals are private; object keys are server-generated).
- Levels with real context get a full nested file: `apps/api-gateway`, `apps/identity-service`, `apps/photo-service`, `apps/web`, `proto/`, `infra/docker/`, `packages/proto-ts`.
- Scaffold services (`cluster-service`, `media-worker`, `connector-service`, `publication-service`, `usage-service`) get a one-line stub (`health-only scaffold; see roadmap stage N`) so the structure is uniform and intentional emptiness is visible.
- **Freshness = discipline.** A rule in `AGENTS.md`: when you change a unit, re-verify its `CLAUDE.md` in the same commit. No automation — an honest acknowledgement that a hook can only detect staleness, not verify semantic accuracy, and we accept discipline for now.

## CLAUDE.md ↔ AGENTS.md Dedup

`AGENTS.md` stays the canonical agent-rules file (cross-tool standard). The root `CLAUDE.md` keeps only Claude-Code-specific content and a pointer. The functional split "rules vs context" is preserved at nested levels through the two sections of a single `CLAUDE.md`, not through a second file.

## Seed bd remember

Capture durable, file-independent decisions from recent sessions:

- Toolchain is pinned with **mise** (`.tool-versions`); JS toolchain is hermetic via pnpm; runtime/infra runs in Docker; mise pins polyglot/binary tools without polluting the host.
- Prioritization principle: invest in what pays off on the existing TS slice now; defer anything that depends on not-yet-built Go/Python services.

(The session-numbering scheme was initially also seeded as a memory, then removed when the numbering was flattened — a sequential convention is self-evident and does not need a memory.)

(A handful of focused memories; update in place rather than duplicating.)

## ADR-0002: Toolchain Pinning With mise

Short ADR at `docs/adr/0002-toolchain-pinning-with-mise.md`:

- **Context:** host pollution vs hermeticity for dev/test/CI tooling; project is already pnpm-centric (hermetic) and Docker-Compose-centric (runtime).
- **Decision:** pin polyglot/binary tools (node, pnpm, go, python; buf stays a pnpm devDep) declaratively via mise + `.tool-versions`; keep the JS toolchain in pnpm; keep runtime/integration infra in Docker. One canonical `make bootstrap`.
- **Considered alternatives:** per-tool `docker run` wrappers (max hermeticity, high iteration friction, weak IDE integration); devcontainer (strongest isolation, larger commit — deferred until Go/Python services are real); global host installs (rejected: pollutes host, not reproducible).
- **Consequences:** reproducible, removable toolchain; one bootstrap path; CI reuses the same pins.

## Session-Numbering Documentation

`sessions/README.md` documents the three schemes with examples, plus a pointer line in `AGENTS.md`.

## Agent-Tooling Research (evaluation only)

A real web-research review of agent-coding support tooling — including whatever "graphlens" refers to and adjacent categories (repo-map / code-graph indexers, ctags/serena-style code-navigation indexers, MCP servers for code navigation) — evaluated against this stack (TypeScript monorepo + gRPC/proto + polyglot Go/Python). Output:

- A research report under `docs/` capturing candidates, what each gives on this stack, integration cost, and a recommendation.
- `bd` follow-up issues for anything worth adopting later.
- No adoption or installation in this session.

## Considered Alternatives & Rationale

Recorded per explicit request, so future sessions see what was weighed.

- **CLAUDE.md granularity** — chose per-service + key dirs (with scaffold stubs) over "root only" (worse locality) and over "every service identical" without distinction. Worst case is mild redundancy, which is acceptable.
- **Freshness mechanism** — chose a discipline rule in `AGENTS.md` over a "Verified-against: <sha>" stamp + staleness script and over a touch-coupling pre-commit hook. Honest reason: automation can only detect staleness, not verify accuracy, and we prefer fewer moving parts now; the script can be added later if discipline proves insufficient.
- **Functional split on nested levels** — chose one `CLAUDE.md` per level with two sections over mirroring `AGENTS.md` + `CLAUDE.md` at every level (2× files, more rot under discipline-only freshness, and nested `AGENTS.md` auto-loading by Claude Code is less certain than `CLAUDE.md`) and over "add only the file that has content" (uneven structure).

## Artifacts

- This design doc.
- Session brief: `sessions/00a_agent_working_conditions.md`.
- Implementation: root + nested `CLAUDE.md`, updated `AGENTS.md`, `bd remember` entries, `docs/adr/0002-toolchain-pinning-with-mise.md`, `sessions/README.md`.
- Research report: agent-tooling evaluation under `docs/`.
- Interim/handoff report in `sessions/`.

## Verification

This session changes documentation and agent-context files; there is no product behavior change and no manual e2e scenario applies. Verification is: `make test` still passes (no regression), nested `CLAUDE.md` content matches the code it describes, and the design doc's deliverable checklist is satisfied.
