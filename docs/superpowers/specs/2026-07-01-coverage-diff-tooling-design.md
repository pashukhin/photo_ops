# Diff-based coverage tooling — design note (thin, exSDD lane)

Date: 2026-07-01 · Issue: `photo_ops-osq` · Branch: `feat/osq-coverage-diff-tooling`

> **Why this note is thin.** Mechanical/well-understood tooling → executable-spec
> lane (agent-workflow-evolution Decision 1). The real spec is the RED
> skeleton + fixture test; this note is intent + layer-routing + entry-points
> only. Do **not** grow it into a prose twin of the script (see `photo_ops-gwh`).

## Intent

Catch the recurring exSDD defect **"spec (skeleton) without tests"** — a new
stub/signature that ships with no covering test — by measuring **new/changed-code
coverage** (diff-based) across the polyglot repo (Go + TS + Python) and reporting
one combined number. Code expresses intent; tests express expected behavior, so
uncovered new code = missing half the spec.

## Scope boundary (no duplicate truth)

- **This issue (`osq`) = measurement + a runnable check.** Per-language coverage
  generation, a combined `diff-cover` runner, a `make coverage-diff` target, a
  `--fail-under` capability (**default 0 = report-only**), a combined markdown
  report, and a fixture self-test. **Not** wired into `make gate`.
- **`photo_ops-q2n` = the gate.** Threshold policy, wiring into the exSDD
  skeleton review-readiness check, and the return-to-rework loop live there, and
  consume this tooling. This note must not restate q2n's rule.

## Layer routing (each fact in its cheapest fail-on-drift home)

| Layer | Home |
| --- | --- |
| That the runner produces a correct combined new-code % and fails under a threshold | fixture **RED test** (the spec) |
| Path normalization actually aligns tool paths with `git diff` paths | same fixture test, asserted end-to-end (this is the risk) |
| Runner contract (flags, env, exit codes) | `scripts/coverage-diff` + its `--help` / usage |
| Make surface | `Makefile` targets `coverage`, `coverage-diff` |
| Toolchain pins (coverage-v8, gocover-cobertura, pytest-cov, diff-cover) | package.json / go tooling / pyproject / the diff-cover install home (decided in plan) |
| Why diff-based over global %, why diff-cover over a bespoke merger | this note + `bd remember` if it recurs |

## Entry points (where the executable spec will live)

- Runner: `scripts/coverage-diff` — computes base `git merge-base HEAD main`,
  gathers/normalizes cobertura XML from all three languages, runs a single
  `diff-cover` over them, emits `.coverage/diff.md` + a stdout summary, honours
  `COVERAGE_FAIL_UNDER` (default 0) and `--base`.
- Per-language coverage: `go test -coverprofile` → `gocover-cobertura`; `vitest
  --coverage` (v8, cobertura reporter); `pytest --cov --cov-report=xml`.
- Combiner: `diff-cover <xml...> --compare-branch=<base> --fail-under=$N
  --markdown-report .coverage/diff.md`.
- Fixture self-test: a tiny known state (one covered + one uncovered **new**
  line per language) asserting the combined % and that `--fail-under` flips the
  exit code — this validates path alignment, the one thing that fails silently.

## Non-goals

- No global per-package % threshold (chosen against: noisy with legacy code).
- No `make gate` wiring, no exSDD skeleton-review rule (that is `q2n`).
- No bespoke lcov merger (chosen against: diff-cover already combines reports).
