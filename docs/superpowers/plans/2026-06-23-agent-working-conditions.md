# Agent Working Conditions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the project's quality/observability backlog cheap to close in future sessions by placing durable knowledge next to the code and defining an explicit knowledge-placement model.

**Architecture:** Documentation and agent-context only. `AGENTS.md` becomes the single canonical agent-rules file; the root `CLAUDE.md` becomes a thin Claude-Code-specific pointer; real services and key directories get two-section nested `CLAUDE.md` files; scaffolds get stubs. Durable decisions go to `bd remember` and an ADR. A research report evaluates agent tooling without adopting it.

**Tech Stack:** Markdown, `bd` (beads) CLI, mise (referenced, not installed), pnpm/NestJS/Next.js/Docker Compose (described, not changed).

## Global Constraints

- Session branch: `session-00a-agent-working-conditions` (already created). No git worktrees.
- Beads epic: `photo_ops-90c`. Track all work under it; do not use TodoWrite/markdown TODOs for project tracking.
- No product behavior changes. No work on the quality/observability backlog issues (`photo_ops-7jh/yl7/zg6/...`).
- No external agent tooling is installed or adopted in this session (research only).
- No freshness automation (no pre-commit/CI staleness checks).
- Nested `CLAUDE.md` files use exactly two sections: `## Local context` and `## Local invariants`.
- Commit message trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Durable invariants (copy verbatim into the relevant nested files; keep consistent with `docs/architecture.md`):
  - `web` talks only to `api-gateway`, except for presigned MinIO upload URLs.
  - `api-gateway` must not connect to any database.
  - `photo-service` owns `photo-db` and the photo upload/list domain.
  - `identity-service` owns `identity-db`, users, credentials, and sessions.
  - A data-owning service connects only to its own DB. Cross-service references use UUID v7.
  - Sync contracts are proto-first. MinIO object keys are server-generated and independent of raw filenames. Originals are private.

---

### Task 1: Root governance refactor (AGENTS.md canonical, slim CLAUDE.md, freshness rule, knowledge model)

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces: a "Knowledge Placement" section and a "CLAUDE.md freshness" rule in `AGENTS.md` that later tasks (nested files, scaffold stubs) refer to; a thin root `CLAUDE.md` that points to `AGENTS.md`.

- [ ] **Step 1: Add the Knowledge Placement section to `AGENTS.md`**

Insert this section after the existing `## Workflow Rules` section:

```markdown
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
```

- [ ] **Step 2: Add the freshness discipline rule to `AGENTS.md`**

Add this bullet to the existing `## Workflow Rules` list (after the "Keep commits small" bullet):

```markdown
- When you change a unit of code, re-verify and update that unit's `CLAUDE.md`
  in the same commit. There is no automated staleness check; keeping nested
  context accurate is a discipline, not a gate.
```

- [ ] **Step 3: Slim the root `CLAUDE.md` to a Claude-Code-specific pointer**

Replace the entire contents of `CLAUDE.md` with:

```markdown
# CLAUDE.md

Claude Code reads this file automatically. The canonical agent working rules
for this project live in `AGENTS.md` — read it first.

## Read First

- `AGENTS.md` — agent working rules, beads workflow, session completion, knowledge placement.
- `README.md`, `project_description.md` — what the project is.
- `docs/architecture.md`, `docs/domain-model.md` — durable boundaries and domain.

## Claude Code Specifics

- Nested `CLAUDE.md` files are auto-loaded when working in their subdirectory;
  read the one nearest the code you are changing.
- Session-numbering schemes are documented in `sessions/README.md`.
- This project uses `bd` (beads) for task tracking and `bd remember` for
  durable cross-session knowledge — not TodoWrite or markdown TODO lists.
```

- [ ] **Step 4: Verify no duplicated rule blocks remain in `CLAUDE.md`**

Run: `grep -c "Session Completion\|MANDATORY WORKFLOW\|bd dolt push" CLAUDE.md`
Expected: `0` (those blocks now live only in `AGENTS.md`).

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md CLAUDE.md
git commit -m "docs: make AGENTS.md canonical, slim root CLAUDE.md, add knowledge model

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Document session-numbering schemes

**Files:**
- Create: `sessions/README.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: the knowledge model from Task 1.
- Produces: `sessions/README.md` referenced by root `CLAUDE.md` (already pointed at in Task 1 Step 3).

- [ ] **Step 1: Create `sessions/README.md`**

```markdown
# Sessions

Each work session has a brief in this directory. Three numbering schemes are in use:

- `NNN_*` (e.g. `001`, `002`, `003`) — product feature sessions that advance the MVP path.
- `00i_*` — review/consolidation sessions that harden the foundation without adding product features (e.g. fortification review).
- `00a_*` — agent working-conditions sessions that improve how effectively an AI agent develops and maintains the project; they add no product features.

Briefs are human-readable summaries; the accepted design and plan for each
session live under `docs/superpowers/specs` and `docs/superpowers/plans`.
```

- [ ] **Step 2: Add a pointer in `AGENTS.md`**

Add this bullet to the `## Workflow Rules` list:

```markdown
- Session-numbering schemes (`NNN` feature, `00i` review, `00a` agent-conditions) are documented in `sessions/README.md`.
```

- [ ] **Step 3: Commit**

```bash
git add sessions/README.md AGENTS.md
git commit -m "docs: document session-numbering schemes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Nested CLAUDE.md for the NestJS backend services

**Files:**
- Create: `apps/api-gateway/CLAUDE.md`
- Create: `apps/identity-service/CLAUDE.md`
- Create: `apps/photo-service/CLAUDE.md`

**Interfaces:**
- Consumes: the two-section format and invariants from the Global Constraints.

- [ ] **Step 1: Read each service before writing**

For each service, read its `src/` tree (modules, controllers, services, `main.ts`) and its `package.json`. For `identity-service` and `photo-service` also read `migrations/`. Base the `## Local context` bullets on what you actually find — do not invent.

- [ ] **Step 2: Write `apps/api-gateway/CLAUDE.md`**

Use this exact skeleton; fill `## Local context` bullets (3-6) from the code you read (HTTP controllers, auth/session handling, CORS, error filter, gRPC clients to identity/photo):

```markdown
# api-gateway

## Local context

- NestJS HTTP edge for the browser; the only backend `web` calls (except presigned MinIO URLs).
- <bullet: how it calls identity-service and photo-service over gRPC — name the clients/modules you found>
- <bullet: session cookie handling — HTTP-only cookie, name from `IDENTITY_SESSION_COOKIE_NAME`>
- <bullet: CORS origin from `WEB_ORIGIN`; HTTP error filter — name the files>
- Tests: `vitest run` (`make test-api`).

## Local invariants

- Must not connect to any database. All persistence goes through identity-service / photo-service gRPC calls.
- Sync service contracts are proto-first; regenerate types with `make proto` after proto edits.
- The session cookie is HTTP-only and is issued/cleared through this gateway.
```

- [ ] **Step 3: Write `apps/identity-service/CLAUDE.md`**

```markdown
# identity-service

## Local context

- Owns users, credentials, and sessions; exposes a gRPC API consumed by api-gateway.
- <bullet: signup/login flow — password hashing approach you found, name the service/repository files>
- <bullet: session creation/lookup — where sessions are stored>
- Schema: `migrations/` applied via `make migrate-identity`.
- Tests: `vitest run` (`make test-identity`).

## Local invariants

- Owns and connects only to `identity-db`; no other service connects to it.
- Passwords are stored hashed, never in plaintext; sessions are server-side.
- Cross-service user references use UUID v7.
```

- [ ] **Step 4: Write `apps/photo-service/CLAUDE.md`**

```markdown
# photo-service

## Local context

- Owns the photo upload/list domain; exposes a gRPC API (port `PHOTO_SERVICE_GRPC_PORT`, default 50051).
- <bullet: upload-intent / presigned PUT / complete flow — name the storage (MinIO) service file>
- <bullet: list scoped by authenticated user — name the controller/service files>
- Schema: `migrations/` applied via `make migrate-photo`.
- Tests: `vitest run` (`make test-photo`).

## Local invariants

- Owns and connects only to `photo-db`.
- MinIO object keys are server-generated and independent of raw filenames; originals are private.
- Photo assets are scoped by authenticated `user_id`; cross-service references use UUID v7.
```

- [ ] **Step 5: Verify the descriptive bullets were filled in**

Run: `grep -rn "<bullet" apps/api-gateway/CLAUDE.md apps/identity-service/CLAUDE.md apps/photo-service/CLAUDE.md`
Expected: no matches (every `<bullet: ...>` placeholder replaced with real content).

- [ ] **Step 6: Commit**

```bash
git add apps/api-gateway/CLAUDE.md apps/identity-service/CLAUDE.md apps/photo-service/CLAUDE.md
git commit -m "docs: add nested CLAUDE.md for backend services

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Nested CLAUDE.md for web, proto, generated types, and infra

**Files:**
- Create: `apps/web/CLAUDE.md`
- Create: `proto/CLAUDE.md`
- Create: `packages/proto-ts/CLAUDE.md`
- Create: `infra/docker/CLAUDE.md`

**Interfaces:**
- Consumes: the two-section format and invariants from the Global Constraints.

- [ ] **Step 1: Read each unit before writing**

Read `apps/web/app` and `apps/web/lib`; `proto/buf.yaml`, `proto/buf.gen.yaml`, and the `proto/*` packages; `packages/proto-ts`; and `infra/docker/docker-compose.yml`.

- [ ] **Step 2: Write `apps/web/CLAUDE.md`**

```markdown
# web

## Local context

- Next.js app for authenticated upload/list; runs on `WEB_PORT` (default 3000).
- <bullet: how it calls api-gateway — `NEXT_PUBLIC_API_BASE_URL`, name the lib/api file>
- <bullet: the upload flow from the browser — presigned MinIO PUT directly to object storage>
- Tests: `vitest run` (`make test-web`).

## Local invariants

- Talks only to `api-gateway`, except for presigned MinIO upload URLs (direct browser-to-MinIO PUT).
- Does not hold its own database or business state; the gateway is the source of truth.
```

- [ ] **Step 3: Write `proto/CLAUDE.md`**

```markdown
# proto

## Local context

- Proto-first service contracts. `buf generate --template buf.gen.yaml` (via `make proto`) emits TypeScript into `packages/proto-ts`.
- Packages: <bullet: list the proto/* domains you found, e.g. identity, photo, common, ...>.

## Local invariants

- Contracts are proto-first: edit `.proto` here, then regenerate. Do not hand-edit generated output.
- Run `make proto` after any contract change so `packages/proto-ts` stays in sync.
```

- [ ] **Step 4: Write `packages/proto-ts/CLAUDE.md`**

```markdown
# proto-ts

## Local context

- Generated TypeScript types/clients from `proto/`. Consumed by api-gateway, identity-service, photo-service, and web.

## Local invariants

- Generated and checked in. Do not hand-edit; regenerate with `make proto` after editing `.proto` sources in `proto/`.
```

- [ ] **Step 5: Write `infra/docker/CLAUDE.md`**

```markdown
# docker (local stack)

## Local context

- `docker-compose.yml` runs the local stack: <bullet: list the service groups — app services, postgres, minio, rabbitmq, scaffolds>.
- Driven via Makefile: `make dev` / `make down` / `make reset` / `make logs` / `make status`.
- Env defaults come from `.env` (template `.env.example`).

## Local invariants

- Container-to-container DB URLs use `postgres:5432`; the host port is `POSTGRES_PORT` (currently 15432).
- Services use `MINIO_ENDPOINT=http://minio:9000`; browser presigned URLs use `MINIO_BROWSER_ENDPOINT=http://localhost:9000`.
- One canonical compose file; prefer Makefile targets over ad-hoc `docker compose` invocations.
```

- [ ] **Step 6: Verify the descriptive bullets were filled in**

Run: `grep -rn "<bullet" apps/web/CLAUDE.md proto/CLAUDE.md packages/proto-ts/CLAUDE.md infra/docker/CLAUDE.md`
Expected: no matches.

- [ ] **Step 7: Commit**

```bash
git add apps/web/CLAUDE.md proto/CLAUDE.md packages/proto-ts/CLAUDE.md infra/docker/CLAUDE.md
git commit -m "docs: add nested CLAUDE.md for web, proto, generated types, infra

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Scaffold stubs

**Files:**
- Create: `apps/cluster-service/CLAUDE.md`
- Create: `apps/media-worker/CLAUDE.md`
- Create: `apps/connector-service/CLAUDE.md`
- Create: `apps/publication-service/CLAUDE.md`
- Create: `apps/usage-service/CLAUDE.md`

- [ ] **Step 1: Write one stub per scaffold, mapped to its roadmap stage**

Use the roadmap order from `docs/roadmap.md` (3 media processing, 4 usage ledger, 5 clustering, 6 publication, 7 sharing/connectors). Each file:

`apps/cluster-service/CLAUDE.md`:
```markdown
# cluster-service

Health-only Go scaffold. No real behavior yet; see roadmap stage 5 (clustering). Preserve service/DB boundaries until an approved session wires it.
```

`apps/media-worker/CLAUDE.md`:
```markdown
# media-worker

Health-only Python scaffold. No real behavior yet; see roadmap stage 3 (media processing). Preserve service boundaries until an approved session wires it.
```

`apps/connector-service/CLAUDE.md`:
```markdown
# connector-service

Health-only TypeScript scaffold. No real behavior yet; see roadmap stage 7 (sharing/connectors). Preserve service/DB boundaries until an approved session wires it.
```

`apps/publication-service/CLAUDE.md`:
```markdown
# publication-service

Health-only TypeScript scaffold. No real behavior yet; see roadmap stage 6 (publication). Preserve service/DB boundaries until an approved session wires it.
```

`apps/usage-service/CLAUDE.md`:
```markdown
# usage-service

Health-only TypeScript scaffold. No real behavior yet; see roadmap stage 4 (usage ledger). Preserve service/DB boundaries until an approved session wires it.
```

- [ ] **Step 2: Commit**

```bash
git add apps/cluster-service/CLAUDE.md apps/media-worker/CLAUDE.md apps/connector-service/CLAUDE.md apps/publication-service/CLAUDE.md apps/usage-service/CLAUDE.md
git commit -m "docs: add CLAUDE.md stubs for scaffold services

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: ADR-0002 — toolchain pinning with mise

**Files:**
- Create: `docs/adr/0002-toolchain-pinning-with-mise.md`

- [ ] **Step 1: Read the existing ADR for format**

Read `docs/adr/0001-architecture-frame.md` and match its heading structure.

- [ ] **Step 2: Write `docs/adr/0002-toolchain-pinning-with-mise.md`**

```markdown
# ADR-0002: Toolchain Pinning With mise

Date: 2026-06-23
Status: Accepted

## Context

Dev/test/CI tooling spans two planes. The JavaScript toolchain (tsc, eslint,
vitest, buf) is already hermetic via pnpm: it lives in `node_modules` and is
pinned by `pnpm-lock.yaml`. Runtime infrastructure (Postgres, MinIO, RabbitMQ,
the services) already runs in Docker Compose. The open question is the
polyglot/binary tooling — node, pnpm, go, python — which otherwise gets
installed globally and pollutes the host with unpinned versions.

## Decision

Pin polyglot/binary tools declaratively with mise (`.tool-versions`): node,
pnpm, go, python. Keep buf as a pnpm devDependency. Keep the JS toolchain in
pnpm and runtime/integration infrastructure in Docker. Expose one canonical
`make bootstrap` (mise install + pnpm install + env file). CI reuses the same
pinned versions.

## Considered Alternatives

- Per-tool `docker run` wrappers — maximum hermeticity, but high iteration
  friction (container startup, volume mounts on every `tsc`/`go test`) and
  weak IDE integration (gopls/pyright want a local toolchain). Rejected for the
  active dev loop.
- Devcontainer — strongest isolation (host needs only Docker + IDE), but a
  larger commit and lower payoff while Go/Python services are still scaffolds.
  Deferred until those services gain real behavior.
- Global host installs — rejected: pollutes the host and is not reproducible.

## Consequences

- Reproducible, removable toolchain managed under mise; nothing leaks globally.
- One bootstrap path, consistent with the "one canonical workflow" guardrail.
- CI and local dev share the same version pins.
- Developers install mise once; that is the only new host prerequisite beyond
  Docker.
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0002-toolchain-pinning-with-mise.md
git commit -m "docs: add ADR-0002 toolchain pinning with mise

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Seed bd remember with durable decisions

**Files:**
- None (beads memory store).

- [ ] **Step 1: Record the toolchain decision**

```bash
bd remember --key photoops-toolchain-mise "Toolchain is pinned with mise (.tool-versions) for node/pnpm/go/python; buf stays a pnpm devDependency. JS toolchain is hermetic via pnpm; runtime/integration infra runs in Docker. One canonical 'make bootstrap'. Rationale and alternatives in docs/adr/0002-toolchain-pinning-with-mise.md."
```

- [ ] **Step 2: Record the session-numbering scheme**

```bash
bd remember --key photoops-session-numbering "Session-numbering schemes: NNN (001..) = product feature sessions; 00i = review/consolidation; 00a = agent working-conditions (improve how the AI agent develops/maintains the project, no product features). Documented in sessions/README.md."
```

- [ ] **Step 3: Record the prioritization principle**

```bash
bd remember --key photoops-prioritization-now-vs-deferred "Prioritization principle: invest in tooling that pays off on the existing TypeScript slice now (CI, typecheck, eslint, structured logs); defer anything that depends on not-yet-built Go cluster-service or Python media-worker until those services gain real behavior."
```

- [ ] **Step 4: Record the knowledge-placement model**

```bash
bd remember --key photoops-knowledge-placement "Knowledge placement: AGENTS.md = canonical agent rules; root CLAUDE.md = thin Claude-Code pointer; nested CLAUDE.md (## Local context / ## Local invariants) = local code knowledge for real services + key dirs, stubs for scaffolds; bd remember = durable file-independent facts; docs/adr + docs/superpowers = decisions and per-session design. Nested CLAUDE.md freshness is discipline (update in the same commit), not automated."
```

- [ ] **Step 5: Verify the memories are stored**

Run: `bd memories photoops 2>&1 | grep -c photoops-`
Expected: at least `4` new keys present (plus the pre-existing worktrees memory).

---

### Task 8: Agent-tooling research report

**Files:**
- Create: `docs/agent-tooling-research.md`

**Interfaces:**
- Produces: follow-up `bd` issues for any tool worth adopting later.

- [ ] **Step 1: Research candidates with web search**

Investigate agent-coding support tooling and capture findings. Cover at least these categories, and resolve what "graphlens" refers to:
- Code-graph / repo-map indexers that give an agent a structural map of a codebase.
- ctags/LSP/serena-style code-navigation indexers and MCP servers exposing code navigation.
- Monorepo-aware context tools relevant to a pnpm + gRPC/proto + polyglot (Go/Python) stack.
For each candidate, record: what it is, whether it is actively maintained, what it gives *on this stack*, integration cost, and a keep/defer/skip recommendation. Do not install anything.

- [ ] **Step 2: Write `docs/agent-tooling-research.md`**

Structure:
```markdown
# Agent Tooling Research

Date: 2026-06-23
Scope: evaluate agent-coding support tooling for the PhotoOps stack
(pnpm TypeScript monorepo + gRPC/proto + polyglot Go/Python). Research only;
no adoption in session 00a.

## Candidates

| Tool | Category | Maintained? | Value on this stack | Integration cost | Recommendation |
| --- | --- | --- | --- | --- | --- |
| ... | ... | ... | ... | ... | ... |

## Notes

<one short subsection per serious candidate with specifics and sources>

## Recommendation

<which, if any, to pilot first, and why; which to skip and why>
```
Fill the table and notes from Step 1. Every recommendation must cite a concrete reason tied to this stack.

- [ ] **Step 3: File follow-up issues for anything worth adopting**

For each "keep/pilot" tool, create a beads issue (priority P3 unless clearly higher), e.g.:
```bash
bd create --type=task --priority=3 --title="Evaluate adopting <tool> for code navigation" --description="From docs/agent-tooling-research.md: <one-line value + integration cost>. Pilot on the existing TS services first; decide before wiring into agent workflow."
```
If nothing clears the bar, write that conclusion explicitly in the report's Recommendation section and create no issues.

- [ ] **Step 4: Commit**

```bash
git add docs/agent-tooling-research.md
git commit -m "docs: add agent-tooling research report

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Session brief, README update, and verification

**Files:**
- Create: `sessions/00a_agent_working_conditions.md`
- Modify: `README.md`

- [ ] **Step 1: Verify no regression**

Run: `make test`
Expected: PASS (this session changes only docs/agent-context; nothing should break).

- [ ] **Step 2: Write the session brief**

Create `sessions/00a_agent_working_conditions.md` summarizing: goal (agent working conditions), what changed (knowledge model in AGENTS.md, slim root CLAUDE.md, nested CLAUDE.md for real units + scaffold stubs, freshness discipline rule, session-numbering doc, ADR-0002, bd remember seeds, agent-tooling research report), verification result from Step 1, follow-up issues created in Task 8, branch name, and the deliverables checklist from the spec marked done.

- [ ] **Step 3: Update `README.md`**

Add a `Session 00a: Agent Working Conditions` block under `## Current status` (mirroring the existing session blocks, checkboxes for the delivered items), and add these lines to `## Key docs`:
```markdown
- `docs/superpowers/specs/2026-06-23-agent-working-conditions-design.md` - accepted agent working-conditions design.
- `docs/agent-tooling-research.md` - agent-tooling evaluation (research only).
- `sessions/README.md` - session-numbering schemes.
- `sessions/00a_agent_working_conditions.md` - agent working-conditions session brief.
```

- [ ] **Step 4: Commit**

```bash
git add sessions/00a_agent_working_conditions.md README.md
git commit -m "docs: add session 00a brief and update README

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Close the epic and push**

```bash
bd close photo_ops-90c --reason="Session 00a delivered: knowledge model, hierarchical CLAUDE.md, ADR-0002, bd memories, tooling research."
git pull --rebase
bd dolt push
git push -u origin session-00a-agent-working-conditions
git status
```
Expected: working tree clean and branch pushed to origin.

---

## Self-Review

- **Spec coverage:** knowledge model (Task 1), hierarchical CLAUDE.md (Tasks 3-5), dedup + slim root (Task 1), freshness rule (Task 1), bd remember seeds (Task 7), ADR-0002 (Task 6), session-numbering doc (Task 2), tooling research report + issues (Task 8), design doc (pre-existing), session brief + interim/handoff (Task 9). All spec sections map to a task.
- **Placeholder scan:** the only intentional fill-ins are the `<bullet: ...>` markers in nested context sections, each guarded by an explicit grep verification step (Task 3 Step 5, Task 4 Step 6) that fails if any remain; and the research-report table, filled from Task 8 Step 1. No "TBD"/"implement later".
- **Type consistency:** section names are uniformly `## Local context` / `## Local invariants`; the seven real-unit paths and five scaffold paths are listed identically in the Global Constraints, Task 1's Knowledge Placement table, and Tasks 3-5.
