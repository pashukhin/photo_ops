# Quality Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up one green quality gate — `typecheck`, `build`, `test`, and proto-drift — runnable locally via `make` and in GitHub Actions CI, over the existing TypeScript slice.

**Architecture:** Add a `typecheck` script (`tsc --noEmit`) to each real TS service plus a root aggregate and Makefile target; add a `proto-check` Makefile target that regenerates proto and fails on any diff; add a single `ubuntu-latest` GitHub Actions workflow that runs install → proto-check → typecheck → build → test. Tooling only — no product features.

**Tech Stack:** pnpm 9.15.4 workspaces, TypeScript 5.7 (`tsc`), NestJS + Next.js, buf/ts-proto, vitest, GitHub Actions, Make.

## Global Constraints

- No product features, no async/media work, no ESLint, no mise — tooling only (spec "Out of Scope").
- The four real TS services are `api-gateway`, `identity-service`, `photo-service`, `web`; only these get a `typecheck` script. `proto-ts` is generated. The scaffold stubs `connector-service`, `publication-service`, `usage-service` are also workspace members (stub `build`, no-op `test`) and are compiled by `pnpm -r build`, but get no `typecheck` script. Only `media-worker` and `cluster-service` have no `package.json`.
- Node 22; pnpm resolved from the root `package.json` `packageManager` field (`pnpm@9.15.4`). Do not pin toolchain via mise.
- Prefer running project commands through `Makefile` targets (AGENTS.md).
- When a unit of code changes, update its nested `CLAUDE.md` in the same commit (AGENTS.md freshness discipline).
- End commit messages with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.
- Keep commits small and aligned with plan tasks; inspect `git status`/`git diff` before each commit.

---

### Task 1: Typecheck scripts + Makefile target (`photo_ops-yl7`)

**Files:**
- Modify: `apps/api-gateway/package.json` (add `typecheck` script)
- Modify: `apps/identity-service/package.json` (add `typecheck` script)
- Modify: `apps/photo-service/package.json` (add `typecheck` script)
- Modify: `apps/web/package.json` (add `typecheck` script)
- Modify: `package.json` (add root `typecheck` aggregate)
- Modify: `Makefile` (add `typecheck` target + `.PHONY`)
- Modify: `apps/api-gateway/CLAUDE.md`, `apps/identity-service/CLAUDE.md`, `apps/photo-service/CLAUDE.md`, `apps/web/CLAUDE.md` (add a `Typecheck:` line)

**Interfaces:**
- Produces: `make typecheck` (runs `pnpm typecheck` → `pnpm -r --if-present typecheck`); each service exposes a `typecheck` npm script. Consumed by Task 3 (CI).

- [ ] **Step 1: Verify the command does not exist yet (red)**

Run: `make typecheck`
Expected: FAIL — `make: *** No rule to make target 'typecheck'.  Stop.`

- [ ] **Step 2: Add the `typecheck` script to each service `package.json`**

In each of `apps/api-gateway/package.json`, `apps/identity-service/package.json`, `apps/photo-service/package.json`, `apps/web/package.json`, add to the `"scripts"` object (next to `"test"`):

```json
    "typecheck": "tsc --noEmit",
```

- [ ] **Step 3: Add the root aggregate script**

In `package.json` (root) `"scripts"`, add after `"build"`:

```json
    "typecheck": "pnpm -r --if-present typecheck",
```

- [ ] **Step 4: Add the Makefile target**

In `Makefile`, add `typecheck` to the `.PHONY` list, and add this target (place it after the `build` target):

```make
typecheck:
	pnpm typecheck
```

- [ ] **Step 5: Run typecheck and verify it passes (green)**

Run: `make typecheck`
Expected: PASS — `tsc --noEmit` runs for `api-gateway`, `identity-service`, `photo-service`, `web` with no type errors and a zero exit code. (`proto-ts` and scaffold dirs are skipped — they have no `typecheck` script.)

If `tsc` surfaces a pre-existing latent type error on the current slice, fix it minimally — that is an allowed cheap fix within scope (spec "Risks / Notes"). Re-run until green.

- [ ] **Step 6: Verify the red path, then revert**

Temporarily add an obvious type error to one service, e.g. in `apps/photo-service/src` append a line `const _typecheckProbe: number = "nope";` to any existing `.ts` file.
Run: `make typecheck`
Expected: FAIL with a TS2322 error naming that file.
Then remove the probe line and re-run `make typecheck` → PASS. (This proves the gate catches regressions; no probe code is committed.)

- [ ] **Step 7: Update nested `CLAUDE.md` freshness**

In each of `apps/api-gateway/CLAUDE.md`, `apps/identity-service/CLAUDE.md`, `apps/photo-service/CLAUDE.md`, `apps/web/CLAUDE.md`, under `## Local context`, add a line directly after the existing `- Tests: ...` line:

```markdown
- Typecheck: `tsc --noEmit` (`make typecheck` runs it across all services).
```

- [ ] **Step 8: Commit**

```bash
git add apps/*/package.json package.json Makefile apps/*/CLAUDE.md
git commit -m "$(cat <<'EOF'
feat(ci): add typecheck gate across TS services (photo_ops-yl7)

Add a `typecheck` (tsc --noEmit) script to api-gateway, identity-service,
photo-service, and web, a root `pnpm -r --if-present typecheck` aggregate,
and a `make typecheck` target. Fast type-only signal separate from build.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Close the issue**

Run: `bd close photo_ops-yl7 --reason="typecheck scripts + make target added and verified green"`

---

### Task 2: Proto drift check (`photo_ops-9h5`)

**Files:**
- Modify: `Makefile` (add `proto-check` target + `.PHONY`)

**Interfaces:**
- Produces: `make proto-check` (runs `pnpm proto` then `git diff --exit-code -- packages/proto-ts`). Consumed by Task 3 (CI).

- [ ] **Step 1: Verify the command does not exist yet (red)**

Run: `make proto-check`
Expected: FAIL — `make: *** No rule to make target 'proto-check'.  Stop.`

- [ ] **Step 2: Add the `proto-check` target**

In `Makefile`, add `proto-check` to the `.PHONY` list, and add this target (place it after the `proto` target):

```make
proto-check:
	pnpm proto
	git diff --exit-code -- packages/proto-ts
```

- [ ] **Step 3: Run proto-check and verify it passes (green)**

Run: `make proto-check`
Expected: PASS — `pnpm proto` regenerates into `packages/proto-ts/src`, and `git diff --exit-code -- packages/proto-ts` reports no changes (exit 0), because the checked-in generated code already matches the `.proto` sources.

If it reports a diff, the checked-in generated code was stale: inspect `git diff -- packages/proto-ts`, commit the regenerated output in its own commit (`chore(proto): regenerate ts-proto to match sources`), then re-run until clean.

- [ ] **Step 4: Verify the red path, then revert**

Hand-edit a generated file under `packages/proto-ts/src` (e.g. add a blank comment line to any `.ts` there).
Run: `make proto-check`
Expected: FAIL — `pnpm proto` overwrites it back, and `git diff --exit-code` exits non-zero (or, if your edit was in a non-regenerated spot, the diff is shown). Restore with `git checkout -- packages/proto-ts` and re-run `make proto-check` → PASS.

- [ ] **Step 5: Commit**

```bash
git add Makefile
git commit -m "$(cat <<'EOF'
feat(ci): add proto drift check (photo_ops-9h5)

`make proto-check` regenerates ts-proto and fails if the checked-in
generated package differs, protecting the proto-first contract boundary.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Close the issue**

Run: `bd close photo_ops-9h5 --reason="make proto-check added; folded into CI in Task 3"`

---

### Task 3: GitHub Actions CI workflow (`photo_ops-7jh`)

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `docs/architecture.md` (one-line CI-gate note in "Current Build State")
- Modify: `README.md` (mention the gate / `make typecheck`)

**Interfaces:**
- Consumes: `make proto-check` (Task 2), `pnpm typecheck` (Task 1), `pnpm build`, `pnpm test` (existing root scripts).
- Produces: a CI workflow that runs on `push` and `pull_request`.

- [ ] **Step 1: Confirm all gate commands pass locally (pre-flight)**

Run each and confirm exit 0:
```bash
make proto-check
make typecheck
make build
make test
```
Expected: all PASS. (If `make build` surfaces a pre-existing latent error, fix it minimally — allowed cheap fix per spec.) These are exactly the commands CI will run, so green here predicts green CI.

- [ ] **Step 2: Create the workflow file**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    name: Quality gate
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up pnpm
        uses: pnpm/action-setup@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Proto generation + drift check
        run: make proto-check

      - name: Typecheck
        run: pnpm typecheck

      - name: Build
        run: pnpm build

      - name: Test (vitest + contract smoke)
        run: pnpm test
```

Notes for the implementer:
- `pnpm/action-setup@v4` reads the pnpm version from the root `package.json` `packageManager` field — do not hardcode a pnpm version.
- The contract smoke inside `pnpm test` uses `python3` and `curl`, both stock on `ubuntu-latest`; no extra setup step is needed.

- [ ] **Step 3: Validate the workflow YAML parses**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"`
Expected: `yaml ok` (no exception).

- [ ] **Step 4: Add the docs notes**

In `docs/architecture.md`, under `## Current Build State`, add a bullet:

```markdown
- CI (`.github/workflows/ci.yml`) gates `push`/`pull_request` on proto-drift, typecheck, build, and tests across the TS slice.
```

In `README.md`, under `## Verification` (or near the local commands), add a line:

```markdown
- Quality gate: `make typecheck`, `make proto-check`, `make build`, and `make test` run locally and in CI (`.github/workflows/ci.yml`) on every push/PR.
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml docs/architecture.md README.md
git commit -m "$(cat <<'EOF'
feat(ci): add GitHub Actions quality gate (photo_ops-7jh)

Run install → proto-check → typecheck → build → test on push/PR over the
TS slice. Defers Go/Python steps and mise to later sessions.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Push the branch and observe CI green**

```bash
git push -u origin session-006-quality-gate
```
Then open a PR (`gh pr create --fill --base main` or via the GitHub UI) and watch the run:
```bash
gh run watch --exit-status
```
Expected: the `Quality gate` job completes green with every step passing. If a step fails, treat it with systematic-debugging, fix on the branch, and re-push until green.

- [ ] **Step 7: Close the issue**

Run: `bd close photo_ops-7jh --reason="CI workflow added and observed green on the session branch PR"`

---

### Task 4: Final verification + session close

**Files:** none (verification + bookkeeping)

**Interfaces:** none

- [ ] **Step 1: Run the full verification scenario**

From the spec §"Verification Scenario":
```bash
make typecheck
make proto-check
make build
make test
```
Expected: all green. (The red-path checks for typecheck and proto-drift were exercised in Tasks 1 and 2.)

- [ ] **Step 2: Confirm the epic's children are closed**

Run: `bd show photo_ops-1yb`
Expected: `photo_ops-yl7`, `photo_ops-9h5`, `photo_ops-7jh` all closed (3/3). Then close the epic:
`bd close photo_ops-1yb --reason="quality gate landed: typecheck, proto-check, CI green"`

- [ ] **Step 3: Session close protocol (AGENTS.md)**

```bash
git status            # confirm clean / everything committed
git pull --rebase
bd dolt push
git push
```
Confirm the CI run on the latest pushed commit is green before declaring the session complete.

---

### Task 5: ESLint flat-config gate (`photo_ops-p8y`, added mid-session)

**Files:**
- Create: `eslint.config.mjs` (root flat config)
- Modify: root `package.json` (devDeps + `lint` script), `apps/*/src/**` as needed to fix violations
- Modify: `.github/workflows/ci.yml` (add a `Lint` step after `Typecheck`)
- Modify: `Makefile` only if a `lint` target is missing (it already exists → `pnpm lint`)

**Interfaces:**
- Produces: `make lint` / `pnpm lint` (`eslint .`) and a CI `Lint` step. Promise-safety rules as `error`.

See the spec's **ESLint Addendum** for the full ruleset, config shape, wiring, and the bounded-burden rule. Summary of acceptance:

- [ ] **Step 1:** Add devDeps: `eslint`, `typescript-eslint`, `@next/eslint-plugin-next` (root). Use current major versions (ESLint 9, typescript-eslint 8).
- [ ] **Step 2:** Write `eslint.config.mjs` per the addendum (ignores; js+ts recommended; the 4 type-aware promise-safety rules via `projectService`; `disableTypeChecked` for `*.{js,mjs,cjs}`; Next plugin for `apps/web/**`).
- [ ] **Step 3:** Set root `package.json` `"lint": "eslint ."`.
- [ ] **Step 4:** Run `make lint`. Fix all `error`-level violations in service code. If a `recommended` rule (likely `no-explicit-any`) yields broad legacy noise, downgrade that one rule to `warn` with a rationale comment and note it in the report; keep promise-safety at `error`.
- [ ] **Step 5:** Confirm the rest of the gate stays green: `make typecheck`, `make build`, `make test`.
- [ ] **Step 6:** Add the `Lint` step to `ci.yml` after `Typecheck` (`run: pnpm lint`). Validate YAML parses.
- [ ] **Step 7:** Red-path probe: drop an `await` on a real async call → `make lint` fails with `no-floating-promises`; revert → green. Never commit the probe.
- [ ] **Step 8:** Commit (message ends with the required trailer). Then `bd close photo_ops-p8y`.

---

## Notes on adapting TDD here

This is tooling work, so each task's "test" is running the gate command and observing the expected red→green transition (command absent/failing → implemented → passing), plus an explicit red-path probe that is reverted, never committed. No new unit tests are added; the existing vitest suites and contract smoke are the behavioral tests the gate runs.
