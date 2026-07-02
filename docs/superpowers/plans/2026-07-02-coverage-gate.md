# Coverage Gate (q2n) Skeleton Commit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to fill this skeleton task-by-task — each task makes its RED tests green within the provided stubs. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Two coverage gates atop the osq tooling — `make skeleton-gate` (RED, at skeleton→review handoff) and `make coverage-gate` (GREEN, at branch completion + CI on PRs) — both enforcing 100% new/changed-code coverage.

**Architecture / WHY:** Both gates = `[COVERAGE_ALLOW_FAIL=1] make coverage` → `scripts/coverage-diff --base <merge-base main> --fail-under 100`. The only new generation capability is `COVERAGE_ALLOW_FAIL` (collect coverage while tolerating failing tests) for the RED path. Behaviour is pinned by executable smokes (throwaway probes + trap-revert, mirroring `scripts/smoke-coverage.sh`); the process rule is the one prose artifact. Design note: `docs/superpowers/specs/2026-07-02-coverage-gate-design.md`. Entry points: RED gate → `make skeleton-gate` + `scripts/smoke-skeleton-gate.sh`; GREEN gate → `make coverage-gate` + `scripts/smoke-coverage-gate.sh`; CI → `.github/workflows/ci.yml`; rule → `AGENTS.md` + skills.

**Tech Stack:** bash, make, existing osq tooling (normalize.py + coverage-diff + diff-cover), GitHub Actions.

## Global Constraints

- Both gates: new/changed-code coverage must be **100%**, via `COVERAGE_FAIL_UNDER` (default 100, overridable).
- RED path collects coverage while tolerating a non-zero test exit (`COVERAGE_ALLOW_FAIL=1`); GREEN path requires passing tests.
- Gate base ref = merge-base with `main` (diff-cover `--compare-branch`). CI uses `origin/main` with full fetch.
- Neither gate is folded into the always-on `make gate`. RED gate is local-only (never in CI). GREEN gate runs in CI on PRs.
- Throwaway smoke probes are appended to MEASURED source files and ALWAYS reverted via an EXIT trap; never committed.
- Do NOT weaken the osq tooling's guarded tests (`scripts/coverage/tests/*`).

## Non-Goals

- NOT the test-integrity / anti-gaming guard (`photo_ops-mp0`) — separate task.
- NOT the edit-time hook (`8d5`) or the executable-smoke rule (`dqb`).
- Does NOT change osq's measurement core (normalize / coverage-diff).
- Does NOT gate the tooling's own Python (`scripts/coverage/*.py`) — out of the measured scope; covered by `make coverage-selftest`.

---

### Task 1: RED gate — `COVERAGE_ALLOW_FAIL` + `make skeleton-gate`

**Files:**
- Modify: `Makefile` — add `COVERAGE_ALLOW_FAIL` handling to `coverage-go`/`coverage-py`/`coverage-ts` (tolerate non-zero test exit, still emit cobertura); add `skeleton-gate` target (stub → real); add both to `.PHONY`.
- New (RED spec): `scripts/smoke-skeleton-gate.sh` + `make smoke-skeleton-gate`.

**Interfaces:**
- Produces: `make skeleton-gate` = `COVERAGE_ALLOW_FAIL=1 make coverage && scripts/coverage-diff --base "$(git merge-base HEAD main)" --fail-under "${COVERAGE_FAIL_UNDER:-100}" --report .coverage/skeleton-gate.md`.
- Consumes: osq's `make coverage-*`, `scripts/coverage-diff`.

**GREEN obligation (for the implementer):** make `scripts/smoke-skeleton-gate.sh` pass. You may add narrower tests; you may not weaken/delete/rename it.

- [ ] **Step 1: Write the RED spec** `scripts/smoke-skeleton-gate.sh` (executable) + `make smoke-skeleton-gate`

The smoke IS the spec. It pins two obligations with throwaway Go probes on a measured file, each in its own gate run, trap-reverted:
- **Untested new stub → gate FAILS and names it.** Append `zzProbeUntested()` to `apps/usage-service/internal/usage/event.go` (no test). Run `make skeleton-gate` (base HEAD). Assert: non-zero exit AND `.coverage/skeleton-gate.md` names `internal/usage/event`.
- **New stub with a covering RED test → gate PASSES.** Append `zzProbeTested()` to `event.go` AND a `TestZzProbeTested` calling it to `apps/usage-service/internal/usage/event_test.go` (the test file's own lines are not instrumented, so only the stub's lines count). Run `make skeleton-gate`. Assert: exit 0 (new stub exercised → 100%).
- EXIT trap reverts `event.go` + `event_test.go` unconditionally; preconditions assert both are clean first. Prints `SMOKE-SKELETON-GATE OK` on success.

`make smoke-skeleton-gate` (add to `.PHONY`, "Local-only; do NOT add to gate/CI"): `scripts/smoke-skeleton-gate.sh`.

- [ ] **Step 2: Run to confirm RED**

Run: `make smoke-skeleton-gate`
Expected: FAILS because `skeleton-gate` is still a stub (exits 3, writes no `.coverage/skeleton-gate.md`) — the "names it" / "exit 0" assertions fail. (Fast: the stub returns before any coverage run.)

- [ ] **Step 3: Write the stubs** in `Makefile`

```make
# RED gate — skeleton review-readiness (photo_ops-q2n). Local-only; NOT in gate/CI.
skeleton-gate:
	@echo "skeleton-gate: not implemented" >&2; exit 3
```
Leave `coverage-go/py/ts` unchanged for now (the `COVERAGE_ALLOW_FAIL` branch is GREEN work).

- [ ] **Step 4: Confirm still RED**

Run: `make smoke-skeleton-gate` — still FAILS on the stub (no report / wrong exit), tree clean after (trap reverted probes). `bash -n scripts/smoke-skeleton-gate.sh` clean.

- [ ] **Step 5: Commit the skeleton**

```bash
git add scripts/smoke-skeleton-gate.sh Makefile
git commit -m "skeleton(q2n): make skeleton-gate + RED smoke (untested stub -> fail, tested stub -> pass)"
```

---

### Task 2: GREEN gate — `make coverage-gate`

**Files:**
- Modify: `Makefile` — add `coverage-gate` target (stub → real); `.PHONY`.
- New (RED spec): `scripts/smoke-coverage-gate.sh` + `make smoke-coverage-gate`.

**Interfaces:**
- Produces: `make coverage-gate` = `make coverage && scripts/coverage-diff --base "$(git merge-base HEAD main)" --fail-under "${COVERAGE_FAIL_UNDER:-100}" --report .coverage/coverage-gate.md` (tests must pass — no `COVERAGE_ALLOW_FAIL`).

**GREEN obligation:** make `scripts/smoke-coverage-gate.sh` pass.

- [ ] **Step 1: Write the RED spec** `scripts/smoke-coverage-gate.sh` (executable) + `make smoke-coverage-gate`

Pins two obligations with throwaway Go probes, trap-reverted:
- **New code covered by a PASSING test → gate PASSES.** Append `zzGatedCovered()` to `event.go` + a passing `TestZzGatedCovered` calling it. Run `make coverage-gate` → exit 0.
- **New uncovered code → gate FAILS and names it.** Append `zzGatedUncovered()` (no test). Run `make coverage-gate` → non-zero, `.coverage/coverage-gate.md` names `internal/usage/event`.
- EXIT trap reverts; preconditions assert clean; prints `SMOKE-COVERAGE-GATE OK`.

`make smoke-coverage-gate` (`.PHONY`, local-only): `scripts/smoke-coverage-gate.sh`.

- [ ] **Step 2: Run to confirm RED**

Run: `make smoke-coverage-gate` — FAILS (stub `coverage-gate` exits 3, no report).

- [ ] **Step 3: Write the stub** in `Makefile`

```make
# GREEN gate — new-code coverage (photo_ops-q2n). Also runs in CI on PRs.
coverage-gate:
	@echo "coverage-gate: not implemented" >&2; exit 3
```

- [ ] **Step 4: Confirm still RED** — `make smoke-coverage-gate` fails on the stub; tree clean after; `bash -n` clean.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-coverage-gate.sh Makefile
git commit -m "skeleton(q2n): make coverage-gate + RED smoke (covered -> pass, uncovered -> fail)"
```

---

### Task 3: CI — GREEN gate on PRs (wiring, no unit RED test)

**Files:**
- Modify: `.github/workflows/ci.yml` — add a `coverage-gate` job triggered on `pull_request`.

**GREEN obligation:** add a job that checks out with full history (`fetch-depth: 0`), sets up the same toolchains the existing jobs use (Node/pnpm + Python + Go), and runs `make coverage-gate` with `COVERAGE_BASE=origin/main`. The local GREEN-gate behaviour is already pinned by Task 2's smoke; CI just invokes the same target against the PR base. This layer is config, not code — its correctness is the job definition + the Task 2 smoke.

- [ ] **Step 1: Add the `coverage-gate` job** to `ci.yml` (see existing `quality`/`media-worker`/`usage-service` jobs for the toolchain setup to mirror). `on: pull_request`; `fetch-depth: 0`; steps: setup toolchains → build coverage venv (`$(COV_STAMP)` via `make coverage-selftest` or install) → `COVERAGE_BASE=origin/main make coverage-gate`.
- [ ] **Step 2: Validate the workflow** locally with `actionlint` if available, else assert the YAML parses and the job invokes `make coverage-gate` with `COVERAGE_BASE=origin/main`.
- [ ] **Step 3: Commit** — `ci(q2n): coverage-gate job on PRs (GREEN new-code 100%)`.

---

### Task 4: Process rule (prose — the one non-executable layer)

**Files:**
- Modify: `AGENTS.md` — Workflow Rules: when to run each gate + return-to-rework.
- Modify: `.claude/skills/superpowers/skills/writing-plans/SKILL.md` and `.../subagent-driven-development/SKILL.md` — add the gate obligations to the skeleton-authoring / task-execution flow.

**GREEN obligation:** document the rule (no RED test — a process rule is prose by nature; this is the layer that legitimately cannot be an executable artifact):
- Before handing a skeleton to human review: run `make skeleton-gate`; on fail, the skeleton is NOT review-ready → return to author to add the missing RED test (spec-change protocol).
- Before final branch review / merge: `make coverage-gate` (mirrored by CI on PRs).
- Reference `COVERAGE_FAIL_UNDER` override; point at the design note.

- [ ] **Step 1** Add the rule to `AGENTS.md` (thin pointer) + the two skills (where the obligation fires).
- [ ] **Step 2** Commit — `docs(q2n): codify the coverage-gate obligations (AGENTS + skills)`.

---

## Self-Review

- **Obligation coverage:** RED gate "untested stub → fail / tested stub → pass" → `smoke-skeleton-gate.sh` (Task 1); GREEN gate "covered → pass / uncovered → fail" → `smoke-coverage-gate.sh` (Task 2); 100% threshold → both smokes + `--fail-under 100`; CI enforcement → Task 3 job; process rule → Task 4 (prose, no test by design). No untested obligation.
- **Skeleton-failure scan:** smokes have concrete probes + concrete assertions; targets are `exit 3` stubs; no GREEN written; `COVERAGE_ALLOW_FAIL` logic deferred to GREEN.
- **Type consistency:** `skeleton-gate` / `coverage-gate` / `COVERAGE_ALLOW_FAIL` / `COVERAGE_FAIL_UNDER` / `COVERAGE_BASE` named identically across tasks and the osq tooling.
- **Reviewable size:** two smokes + two make stubs + one CI job + one doc rule.
- **No GREEN:** gate targets are stubs; the `COVERAGE_ALLOW_FAIL` branch, the CI job body, and the rule text are the implementer's GREEN.
