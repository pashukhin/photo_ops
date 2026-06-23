# Session 006: Quality Gate

This is a tooling session, not a product feature session. The goal was to stand
up a single green quality gate — runnable locally and in CI — over the existing
TypeScript slice **before** session 007 introduces the first async workflow and
the first real polyglot (Python) service. No product features, no async/media
work.

## Goal

Catching type, build, and proto-drift regressions automatically is cheap now and
pays off on every later session, especially once async + Python widen the surface
to debug. The session put that gate in place and proved it green both locally and
on GitHub Actions.

## What Changed

### Typecheck signal (`photo_ops-yl7`)

- A `typecheck` script (`tsc --noEmit`) was added to the four real TS services
  (`api-gateway`, `identity-service`, `photo-service`, `web`), a root aggregate
  `pnpm -r --if-present typecheck`, and a `make typecheck` target. Fast, type-only
  signal separate from a full `build`.
- Each affected service's nested `CLAUDE.md` gained a `Typecheck:` line in the
  same commit (freshness discipline).
- `*.tsbuildinfo` was added to `.gitignore` (incremental `tsc` emits it).

### Proto drift check (`photo_ops-9h5`)

- A `make proto-check` target runs `pnpm proto` then
  `git diff --exit-code -- packages/proto-ts`, failing if the checked-in ts-proto
  output drifts from the `.proto` sources. Protects the proto-first contract
  boundary that matters more once 007 adds async contracts.

### CI workflow (`photo_ops-7jh`)

- `.github/workflows/ci.yml` runs on `push` and `pull_request` (with
  `concurrency: cancel-in-progress` and `permissions: contents: read`). One
  `ubuntu-latest` job: checkout → pnpm (`pnpm/action-setup`, version from the
  `packageManager` field) → Node 22 (`actions/setup-node`, `cache: pnpm`) →
  `pnpm install --frozen-lockfile` → `make proto-check` → `pnpm typecheck` →
  `pnpm build` → `pnpm test` (vitest + contract smoke; `python3`/`curl` are stock
  on the runner, so no Docker).

### Resolved forks (decided at brainstorming, with the user)

- **ESLint (`p8y`)** — **deferred** to a separate later step. Lint remains a no-op
  everywhere; this gate enforces types + build + tests + proto-drift, not lint.
- **Proto drift (`9h5`)** — **included now** as a CI step (cheap, protects the
  contract boundary).
- **mise / `.tool-versions` (ADR-0002)** — **deferred**. CI pins Node in-workflow
  and resolves pnpm from `packageManager`; mise (which also covers go/python) is
  left until those services exist.

### Docs

- One-line CI-gate note added to `docs/architecture.md` "Current Build State".
- Quality-gate commands noted in `README.md` "Verification".
- Design spec: `docs/superpowers/specs/2026-06-23-quality-gate-design.md`.
- Implementation plan: `docs/superpowers/plans/2026-06-23-quality-gate.md`.

## Process

Brainstorming → accepted spec → task-by-task plan → subagent-driven development
(4 tasks, each with a spec+quality task review) → whole-branch review (verdict:
ready to merge) → fix wave for 3 Minor findings. The manual verification scenario
was written into the spec and approved before any code was written.

## Verification

- **Local gate — PASS.** `make typecheck`, `make proto-check`, `make build`, and
  `make test` (39 unit tests across the 4 services + contract smoke) all green at
  HEAD with a clean working tree.
- **Red-path checks — PASS.** A deliberate type error made `make typecheck` fail
  (Task 1); a hand-edit under `packages/proto-ts` made `make proto-check` fail
  (Task 2). Both probes were reverted, never committed.
- **CI — GREEN.** GitHub Actions `Quality gate` job passed every step on
  `session-006-quality-gate` (runs `28012990377` and tip `28014344784`).

## Known Limitations / Caveats

- **Typecheck covers 4 of 7 TS packages.** The scaffold stubs
  `connector-service`, `publication-service`, `usage-service` have a stub `build`
  but no `typecheck` script, so they are type-checked only via `pnpm -r build`,
  not the fast `typecheck` step. A type error in a scaffold is still caught by the
  gate (at the build step). `media-worker` and `cluster-service` have no
  `package.json` and are out of the workspace entirely.
- **No lint in the gate.** ESLint is still a no-op (deferred `p8y`).
- **Proto-check ignores untracked files** (filed as `photo_ops-1yb.1`); the
  in-scope drift case — editing a `.proto` without regenerating tracked output —
  is caught.
- **No Go/Python CI yet** (tracked by `photo_ops-78z` for a later session).
- CI shows a benign GitHub annotation: the `@v4` actions' Node-20 runtime is
  deprecated and forced to Node 24 — resolved by future action releases; it does
  not affect the project's Node 22 toolchain.

## Follow-up Issues

- `photo_ops-1yb.1` (P3) — Harden proto drift check against untracked generated
  files (use `git status --porcelain` or `git add -N` before the diff).
- `photo_ops-p8y` (P2) — Set up real ESLint linting across services (still open;
  see the assessment in the session handoff).

## Branch

`session-006-quality-gate`

## Deliverables Checklist

- [x] `typecheck` script in the 4 real services + root aggregate + `make typecheck`
- [x] `make proto-check` proto drift target
- [x] `.github/workflows/ci.yml` quality gate on push/PR
- [x] Nested `CLAUDE.md` freshness updates for the 4 services
- [x] `*.tsbuildinfo` gitignored
- [x] Design spec + implementation plan committed
- [x] `docs/architecture.md` and `README.md` notes
- [x] Local gate green + both red-paths exercised
- [x] CI observed green on GitHub Actions
- [x] Epic `photo_ops-1yb` + children `yl7`/`9h5`/`7jh` closed
- [x] Follow-up `photo_ops-1yb.1` filed
- [x] Session report (this file)

## Next Step

Land this branch into `main` so the gate protects `main` (pending decision), then
session 007 (first async workflow + Python media-worker) builds on a green gate.
ESLint (`p8y`) is the natural next quality increment — see the session handoff for
the effort assessment.
