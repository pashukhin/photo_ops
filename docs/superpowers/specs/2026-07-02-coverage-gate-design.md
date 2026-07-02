# Coverage gate (q2n) — design note (thin, exSDD lane)

Date: 2026-07-02 · Issue: `photo_ops-q2n` · Branch: `feat/test-gates`

> **Why thin.** Process/tooling on the executable-spec lane (agent-workflow-evolution
> Decision 1). The real spec is the behavior smoke(s) + the make/CI wiring; this note
> is intent + decisions + layer-routing + entry-points only. Not a prose twin (see `photo_ops-gwh`).

## Intent

Mechanically enforce that new/changed code is tested — the recurring "spec without
tests" defect (s012 shipped `reader.go` as a stub with no RED test). Two gates atop
the osq measurement tooling (`make coverage-diff`, already on this branch):

- **RED `make skeleton-gate`** — at the skeleton→review handoff, local. Collects
  coverage while *tolerating failing tests*; every new/changed line must be
  *exercised* by a (RED) test → "no untested new stub."
- **GREEN `make coverage-gate`** — at branch completion + in CI on PRs. Coverage
  from *passing* tests; every new/changed line must be covered.

## Decisions (from brainstorm 2026-07-02)

- Both gates. Both threshold = **100% new/changed-code** coverage, via
  `COVERAGE_FAIL_UNDER` (default 100, per-repo overridable).
- RED path uses a new generation mode `COVERAGE_ALLOW_FAIL=1` (the coverage-*
  recipes tolerate a non-zero test exit and still emit cobertura). GREEN path =
  the existing `make coverage` (tests must pass).
- Homes: `make` targets (teeth) + a rule in AGENTS.md/skills (when to run +
  return-to-rework) + the GREEN gate as a **CI job on PRs**. RED gate is
  local-only (a skeleton commit fails CI on its RED tests anyway).

## Layer routing (each fact in its cheapest fail-on-drift home)

| Layer | Home |
| --- | --- |
| Gate behaviour: untested new stub → FAIL; stub with a covering test → PASS | executable **smoke** (`scripts/smoke-skeleton-gate.sh`, throwaway-probe + trap, mirroring `smoke-coverage.sh`) |
| RED coverage collected despite failing tests | `COVERAGE_ALLOW_FAIL` branch in `coverage-{go,py,ts}` recipes; asserted by the smoke |
| Gate commands / thresholds | `make skeleton-gate` / `make coverage-gate` + `coverage-diff --fail-under` |
| GREEN gate enforced on PRs | `.github/workflows/ci.yml` job (base `origin/main`, full fetch) |
| **Process rule**: when to run each gate + return-to-rework (spec-change protocol) | AGENTS.md Workflow Rules + writing-plans / subagent-driven-development skills — the one thing that *must* be prose |
| Why 100% / two gates | this note + the `q2n` issue |

## Entry points (where the executable spec will live)

- `make skeleton-gate` — `COVERAGE_ALLOW_FAIL=1` coverage → `coverage-diff --base <merge-base main> --fail-under 100`.
- `make coverage-gate` — `make coverage` (green) → `coverage-diff --fail-under 100`.
- `COVERAGE_ALLOW_FAIL` handling inside `coverage-go` / `coverage-py` / `coverage-ts`.
- `scripts/smoke-skeleton-gate.sh` + `make smoke-skeleton-gate` — the behaviour spec.
- `.github/workflows/ci.yml` — a `coverage-gate` job on PRs.
- AGENTS.md + the two skills — the process obligation.

## Error handling / edge cases

- A runner must emit coverage on test failure (go writes the profile; pytest-cov /
  vitest write reports) — validated by the smoke, not assumed.
- Skeleton that does not compile (Go stub) → coverage can't generate → gate errors
  clearly, distinct from "uncovered."
- No measured-language changes in the diff → diff-cover "no lines" → PASS.
- **Known scope boundary:** the tooling's own Python (`scripts/coverage/*.py`) is not
  in the measured set (`coverage-py` measures `src/media_worker`), so its new lines
  are not gated by coverage-diff — they are covered by `make coverage-selftest`.

## Non-goals (negative space)

- NOT the test-integrity / anti-gaming guard (`photo_ops-mp0`) — that protects these
  gates from being gamed by weakening tests; separate task on this branch.
- NOT the edit-time hook (`8d5`) or the executable-smoke rule (`dqb`).
- RED gate is NOT wired into CI. The GREEN gate is NOT folded into the always-on
  `make gate` (it is a PR job + a completion-time target).
- Does NOT change osq's measurement (normalize / coverage-diff core).
