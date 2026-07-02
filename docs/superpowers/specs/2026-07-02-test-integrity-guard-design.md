# Test-integrity diff-guard (mp0) — design note (thin, exSDD lane)

Date: 2026-07-02 · Issue: `photo_ops-mp0` · Branch: `feat/test-gates`

> **Why thin.** Tooling on the executable-spec lane. The real spec is the pure-core
> unit tests + the git-orchestrator smoke; this note is intent + decisions +
> layer-routing + entry-points. Not a prose twin (see `photo_ops-gwh`).

## Intent

Mechanize the "tests are guarded" rule: detect **removed / renamed-away test
declarations and deleted test files** across a change, and refuse the change unless
the removal is explicitly acknowledged. Pairs with q2n: the coverage gate says
"new code has tests"; this guard says "existing tests are not deleted to game it."
Assertion-*weakening* is semantic and out of mechanical reach — that is the
mutation-testing bead (`photo_ops-9n8`), not this.

## Decisions (from brainstorm 2026-07-02)

- **Scope: diff-guard only.** Mutation testing → `photo_ops-9n8`; visible/hidden
  acceptance-test split → `photo_ops-wyq`. proto/schema/migration flagging is
  **dropped** from this feature (different concern; proto is already covered by
  `make proto-check`).
- **Detection: per-test-declaration.** A named test present in the base blob but
  absent in head (removed or renamed-away), or a deleted test file, is a removal.
  Extraction by path convention: Go `func (Test|Benchmark|Fuzz|Example)\w+`,
  Python `def test_\w+`, TS `it(`/`test(` titles (best-effort regex).
- **Override: commit trailer** `Allow-test-removal: <reason>` on the removing
  commit (auditable in history; ties to the exSDD spec-change protocol).
- **Testable core + thin git orchestrator** (mirrors osq's normalize): pure Python
  functions for extraction / set-diff / trailer-parse (unit-tested with fixtures);
  a thin bash orchestrator does the git plumbing.
- **Homes:** `make test-guard` (local) + a CI PR job (base = PR base SHA), mirroring
  the coverage-gate. NOT in the always-on `make gate`. Rule → AGENTS.md (concrete)
  + the skills already carry the generic "don't weaken guarded tests."

## Layer routing (each fact in its cheapest fail-on-drift home)

| Layer | Home |
| --- | --- |
| Which decls a test blob declares (per language) | `test_declarations(path, text)` — pure, unit-tested |
| What counts as a removal (base vs head sets + deleted files) | `removed_declarations(base_blobs, head_blobs)` — pure, unit-tested |
| Whether a removal is acknowledged | `has_removal_ack(commit_msgs)` (`Allow-test-removal:` trailer) — pure, unit-tested |
| git plumbing (blobs via `git show base:path`, `git log base..head`) + exit | `scripts/test-guard` (bash orchestrator) |
| End-to-end behaviour (removal→FAIL; removal+trailer→PASS) | `scripts/smoke-test-guard.sh` (throwaway commit + trap `git reset --hard`) |
| Enforcement | `make test-guard` + `.github/workflows/ci.yml` PR job |
| Process rule | AGENTS.md (concrete `make test-guard`) + skills (generic, already present) |
| Why | this note + the `mp0` issue |

## Entry points

- `scripts/testguard/guard.py` (or similar) — the pure core + its unit tests.
- `scripts/test-guard` — the orchestrator (base = `${GUARD_BASE:-$(git merge-base HEAD main)}`).
- `make test-guard`, `make smoke-test-guard`; a `test-guard` CI job (PR-only, fetch-depth 0, base = PR base SHA).
- AGENTS.md Workflow Rules — the concrete rule + `Allow-test-removal:` convention.

## Error handling / edge cases

- TS title extraction is best-effort (regex on `it/test('...')`); a removed/renamed
  TS test is caught as a changed title set. Dynamic titles may evade — documented limit.
- A rename that preserves the exact declaration name/title is not a removal (nothing lost).
- Base = merge-base with `main`; a failed merge-base aborts (never an empty base), mirroring the coverage gates.
- Non-test files are ignored (path convention gate).

## Non-goals (negative space)

- Mutation testing / assertion-weakening detection → `photo_ops-9n8`.
- Visible/hidden acceptance-test split → `photo_ops-wyq`.
- proto/schema/migration change flagging — dropped (proto covered by `make proto-check`).
- NOT in the always-on `make gate`. Does not change q2n or osq.
