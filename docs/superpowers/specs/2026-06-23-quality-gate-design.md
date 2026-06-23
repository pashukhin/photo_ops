# Session 006: Quality Gate — Design

Date: 2026-06-23
Epic: `photo_ops-1yb`
Children: `photo_ops-yl7` (typecheck), `photo_ops-7jh` (CI), `photo_ops-9h5` (proto drift)

## Goal

Put a single green quality gate — runnable locally and in CI — over the existing
TypeScript slice **before** session 007 introduces the first async workflow and
the first real polyglot (Python) service. Catching type, build, and proto-drift
regressions automatically is cheap now and pays off on every later session, when
async + Python widen the surface to debug.

This session adds tooling only. No product features, no async/media work, no
observability beyond what CI needs.

## Current State

- Workspace packages with a `package.json` (covered by `pnpm -r`): the four real
  services `api-gateway`, `identity-service`, `photo-service`, `web`, the generated
  `proto-ts`, plus three scaffold stubs `connector-service`, `publication-service`,
  `usage-service`.
- The scaffold stubs `connector-service`, `publication-service`, `usage-service`
  each carry a `package.json` with a stub `build` (`tsc -p tsconfig.json`) and
  no-op `test`/`lint`, so `pnpm -r build` compiles them and `pnpm -r test` runs
  their no-ops. None has a `typecheck` script, so `pnpm typecheck`
  (`--if-present`) covers only the four real services — but a type error in a
  scaffold is still caught by the `build` step.
- Only `media-worker` and `cluster-service` have no `package.json`; the workspace
  globbing skips those two entirely.
- No service has a `typecheck` script; type errors surface only at full `build`.
- `lint` is a no-op (`node -e "process.exit(0)"`) in every service.
- No `.github/` directory exists.
- Generated ts-proto code is checked into `packages/proto-ts/src` but nothing
  verifies it matches the `.proto` sources.
- The existing gate (`pnpm test` → contract smoke + vitest) is green. The contract
  smoke (`scripts/test-smoke-upload-contract.sh`) uses `python3` + `curl` and needs
  no Docker.
- Toolchain: Node 22, pnpm 9.15.4 (`packageManager` field).

## Resolved Forks

- **ESLint (`p8y`)** — **deferred** to a separate later step. This session ships a
  green gate (typecheck + build + vitest + contract smoke). A real flat-config
  ESLint setup means both choosing config and fixing existing violations — meaty
  work that risks an initially-red gate and scope creep. CI structure needs no
  rework to add it later.
- **Proto drift (`9h5`)** — **included now** as a CI step. Cheap (buf is already a
  pnpm devDependency, so `pnpm proto` is hermetic), protects the proto-first
  contract boundary that matters more once 007 adds async contracts.
- **mise / `.tool-versions` (ADR-0002)** — **deferred**. CI pins Node in-workflow
  and resolves pnpm from the `packageManager` field. Full mise covers go/python
  toolchains for services not built yet; implementing it now would violate the
  "defer until those services exist" prioritization principle. Local dev stays
  unchanged. Pick up mise when Go/Python land (007+).

## Design

### 1. Typecheck (`yl7`)

- Add `"typecheck": "tsc --noEmit"` to the four real services: `api-gateway`,
  `identity-service`, `photo-service`, `web`.
  - `web` already sets `noEmit` in tsconfig; the flag is harmless.
  - The three NestJS configs emit to `dist`; `--noEmit` overrides emit for a
    type-only check.
- Root `package.json`: `"typecheck": "pnpm -r --if-present typecheck"`.
- `Makefile`: add a `typecheck` target → `pnpm typecheck` (and to `.PHONY`).
- No `typecheck` script is added to `proto-ts` (generated) or to the scaffold
  stubs; `pnpm -r --if-present typecheck` therefore runs only on the four real
  services. The scaffold stubs are still compiled by `pnpm -r build`, so the gate
  as a whole still catches type errors in them.

### 2. Proto drift check (`9h5`)

- `Makefile` target `proto-check`:

  ```make
  proto-check:
  	pnpm proto
  	git diff --exit-code -- packages/proto-ts
  ```

  One canonical command, reused by CI. Diff is scoped to `packages/proto-ts` so
  unrelated dirty files do not trip it during local use. ts-proto output is
  deterministic, so a clean tree means generation matches the `.proto` sources.

### 3. CI workflow (`7jh`) — `.github/workflows/ci.yml`

- Triggers: `push` and `pull_request`, with
  `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }` to
  avoid wasted duplicate runs. (Same-repo PRs run twice — once for the branch
  push, once for the PR — accepted as a minor cost on a solo repo in exchange for
  both per-branch and merge-result feedback.)
- One `ubuntu-latest` job, steps ordered fast-signal-first:
  1. `actions/checkout`
  2. `pnpm/action-setup` (version resolved from the `packageManager` field — the
     single source of truth that lets us defer mise)
  3. `actions/setup-node` with `node-version: 22` and `cache: pnpm`
  4. `pnpm install --frozen-lockfile`
  5. `make proto-check` (generate **and** drift-check — covers `9h5`)
  6. `pnpm typecheck`
  7. `pnpm build`
  8. `pnpm test` (vitest across apps + contract smoke; `python3` and `curl` are
     present on `ubuntu-latest`, so no Docker is needed)

### Docs / freshness

- Update each affected service's nested `CLAUDE.md` in the same commit if it
  enumerates scripts, so `typecheck` is recorded.
- Add a one-line CI-gate note to `docs/architecture.md` "Current Build State".
- Note the gate / `make typecheck` in `README.md`.
- This spec is the durable record of the decisions; no separate ADR is needed
  (mise ADR-0002 already exists and is explicitly deferred here).

## Out of Scope

- No product features, no async / media-processing work (session 007).
- No real ESLint (`p8y`), no mise implementation.
- No structured logging / observability beyond what CI needs.
- Go/Python service CI steps — wired later when those services gain behavior.

## Verification Scenario (manual e2e)

1. `make typecheck`, `make proto-check`, `make build`, `make test` — all green
   locally.
2. Inject a type error in one service → `make typecheck` goes red; revert → green.
3. Hand-edit a generated file under `packages/proto-ts` → `make proto-check` red;
   revert → green.
4. Push `session-006-quality-gate`, open a PR → the CI workflow runs all steps and
   is green. The injected-error checks (2, 3) demonstrate the red path without
   pushing a red commit to `main`.

## Risks / Notes

- If `make build` or `make typecheck` surfaces a pre-existing latent type/build
  error on the current slice, fixing it is an allowed cheap fix within this
  session's scope (the point of the gate is to make the slice provably green).
- CI depends on `python3`/`curl` for the contract smoke; both are stock on
  `ubuntu-latest`. If that ever changes, add an explicit setup step.
