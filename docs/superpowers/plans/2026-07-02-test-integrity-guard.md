# Test-integrity diff-guard (mp0) Skeleton Commit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to fill this skeleton task-by-task — each task makes its RED tests green within the provided stubs. Steps use checkbox (`- [ ]`) syntax.

**Goal:** `make test-guard` fails a change that removes/renames-away a test declaration or deletes a test file, unless the removing commit carries an `Allow-test-removal: <reason>` trailer.

**Architecture / WHY:** A pure Python core (extract test declarations per language / set-diff base↔head / detect the ack trailer) — unit-tested with fixtures — behind a thin bash git-orchestrator that supplies blobs and commit messages. Mirrors osq's normalize (testable core + thin shell). Entry points: core → `scripts/testguard/guard.py`; behaviour → `scripts/testguard/tests/test_guard.py` + `scripts/smoke-test-guard.sh`; wiring → `Makefile` + `.github/workflows/ci.yml`. Design note: `docs/superpowers/specs/2026-07-02-test-integrity-guard-design.md`.

**Tech Stack:** Python (stdlib only — `re`), bash, make, GitHub Actions. Unit tests run via the existing `scripts/coverage/.venv` (pytest).

## Global Constraints

- Detection is per-test-declaration: Go `func (Test|Benchmark|Fuzz|Example)\w+`, Python `def test_\w+`, TS `it(`/`test(` titles (best-effort). A decl in base absent in head, or a deleted test file, is a removal.
- A removal is permitted ONLY if a commit in `base..head` carries an `Allow-test-removal: <reason>` trailer (non-empty reason).
- Base = `${GUARD_BASE:-$(git merge-base HEAD main)}`; a failed merge-base aborts (never an empty base). CI uses the PR base SHA.
- Non-test files are ignored (path-convention gate). The core is stdlib-only.
- NOT wired into the always-on `make gate`. `test-guard` runs locally + as a CI PR job.
- Core public names must NOT start with `test_` (pytest would collect them): use `find_test_declarations`, `removed_declarations`, `has_removal_ack`.

## Non-Goals

- Mutation testing / assertion-weakening (`photo_ops-9n8`); visible/hidden split (`photo_ops-wyq`); proto/schema/migration flagging (dropped).
- Detecting semantic weakening of an assertion (a kept-but-gutted test) — out of mechanical reach.
- Not in `make gate`; does not change q2n/osq.

---

### Task 1: Pure core — declaration extraction, removal set-diff, ack trailer

**Files:**
- Stub: `scripts/testguard/guard.py` (three functions raise `NotImplementedError`); `scripts/testguard/__init__.py`; `scripts/testguard/tests/__init__.py`
- Test: `scripts/testguard/tests/test_guard.py` (RED)
- Modify: `Makefile` (add `test-guard-selftest: $(COV_STAMP)` running pytest on `scripts/testguard/tests`; add to `.PHONY`)

**Interfaces:**
- Produces:
  - `find_test_declarations(path: str, text: str) -> set[str]` — test decls in `text`, keyed by language via `path` suffix; `set()` for non-test paths.
  - `removed_declarations(base: dict[str, str | None], head: dict[str, str | None]) -> dict[str, list[str]]` — per changed test file, decls in base absent in head (a `None` head text = deleted file → all base decls); only files with removals, values sorted.
  - `has_removal_ack(commit_messages: list[str]) -> bool` — any message has an `Allow-test-removal: <non-empty>` trailer line.

**GREEN obligation (for the implementer):** make the RED tests pass within the stubs. Add narrower tests if useful; do not weaken/delete/rename these.

- [ ] **Step 1: Write the RED test** `scripts/testguard/tests/test_guard.py`

```python
from scripts.testguard.guard import (
    find_test_declarations,
    has_removal_ack,
    removed_declarations,
)

GO_BASE = 'package x\nfunc TestA(t *testing.T){}\nfunc TestB(t *testing.T){}\n'
GO_HEAD = 'package x\nfunc TestA(t *testing.T){}\n'
PY_BASE = 'def test_x():\n    assert 1\ndef test_y():\n    assert 2\n'
PY_HEAD = 'def test_x():\n    assert 1\n'
TS_BASE = "it('does a', () => {});\ntest('does b', () => {});\n"
TS_HEAD = "it('does a', () => {});\n"


def test_go_declarations_extracted_by_name():
    # why: Go test funcs are the decl unit; keyed off the _test.go suffix.
    assert find_test_declarations('apps/x/foo_test.go', GO_BASE) == {'TestA', 'TestB'}


def test_non_test_file_yields_no_declarations():
    # why: a `func Test...` in a NON-_test.go file must not be counted.
    assert find_test_declarations('apps/x/foo.go', GO_BASE) == set()


def test_python_and_ts_declarations_extracted():
    # why: per-language extraction (Python def test_*, TS it/test titles).
    assert find_test_declarations('apps/x/test_foo.py', PY_BASE) == {'test_x', 'test_y'}
    assert find_test_declarations('apps/x/foo.spec.ts', TS_BASE) == {'does a', 'does b'}


def test_removed_declaration_detected_per_language():
    # why: a decl present in base but gone in head is a removal (the core signal).
    base = {'a_test.go': GO_BASE, 'test_p.py': PY_BASE, 'c.spec.ts': TS_BASE}
    head = {'a_test.go': GO_HEAD, 'test_p.py': PY_HEAD, 'c.spec.ts': TS_HEAD}
    assert removed_declarations(base, head) == {
        'a_test.go': ['TestB'],
        'test_p.py': ['test_y'],
        'c.spec.ts': ['does b'],
    }


def test_deleted_test_file_removes_all_its_declarations():
    # why: deleting a test file removes every decl it held.
    assert removed_declarations({'a_test.go': GO_BASE}, {'a_test.go': None}) == {
        'a_test.go': ['TestA', 'TestB']
    }


def test_rename_away_counts_as_removal():
    # why: renaming a test drops the old name — a removal (design decision).
    assert removed_declarations(
        {'a_test.go': 'func TestOld(t *testing.T){}\n'},
        {'a_test.go': 'func TestNew(t *testing.T){}\n'},
    ) == {'a_test.go': ['TestOld']}


def test_pure_addition_is_not_a_removal():
    # why: adding tests must never trip the guard.
    assert removed_declarations({'a_test.go': GO_HEAD}, {'a_test.go': GO_BASE}) == {}


def test_ack_trailer_detected_only_with_reason():
    # why: the escape hatch is an auditable trailer with a reason.
    assert has_removal_ack(['fix\n\nAllow-test-removal: obsolete behavior']) is True
    assert has_removal_ack(['fix the thing']) is False
    assert has_removal_ack(['x\n\nAllow-test-removal:']) is False  # empty reason
```

- [ ] **Step 2: Run to confirm RED**

Run: `scripts/coverage/.venv/bin/python -m pytest scripts/testguard/tests -q`
Expected: FAIL with `NotImplementedError` (symbols resolve; not import/collection errors). If pytest tries to collect a core function as a test, the name violates the `test_`-prefix constraint — rename it.

- [ ] **Step 3: Write the stubs** `scripts/testguard/guard.py`

```python
"""Test-integrity diff-guard core (photo_ops-mp0). Stdlib only.
See docs/superpowers/specs/2026-07-02-test-integrity-guard-design.md."""
from __future__ import annotations


def find_test_declarations(path: str, text: str) -> set[str]:
    """Test declarations in `text`, chosen by `path` suffix (Go _test.go,
    Python test_*.py/*_test.py, TS *.spec/*.test .ts/.tsx). set() if `path`
    is not a recognized test file."""
    raise NotImplementedError  # GREEN is the implementer's job


def removed_declarations(
    base: dict[str, str | None], head: dict[str, str | None]
) -> dict[str, list[str]]:
    """Per test file present in `base`, the declarations absent from `head`
    (a None head value = deleted file). Only files with removals; values sorted."""
    raise NotImplementedError


def has_removal_ack(commit_messages: list[str]) -> bool:
    """True iff some message carries an `Allow-test-removal: <non-empty>` trailer."""
    raise NotImplementedError
```
Add empty `scripts/testguard/__init__.py` and `scripts/testguard/tests/__init__.py` (mirror osq's `scripts/coverage` package layout so `from scripts.testguard.guard import ...` resolves from repo root). Add to the Makefile:
```make
test-guard-selftest: $(COV_STAMP)
	$(COV_DIR)/.venv/bin/python -m pytest scripts/testguard/tests -q
```

- [ ] **Step 4: Confirm still RED + symbols resolve**

Run: `make test-guard-selftest` — FAILS on `NotImplementedError`, no import/collection error.

- [ ] **Step 5: Commit**

```bash
git add scripts/testguard Makefile
git commit -m "skeleton(mp0): test-integrity core (RED unit tests + stubs)"
```

---

### Task 2: Orchestrator `scripts/test-guard` + end-to-end smoke

**Files:**
- Stub: `scripts/test-guard` (bash; body prints not-implemented + `exit 3`)
- Test (RED spec): `scripts/smoke-test-guard.sh` + `make test-guard` / `make smoke-test-guard` (`.PHONY`)

**Interfaces:**
- Consumes: the Task 1 core (`find_test_declarations`/`removed_declarations`/`has_removal_ack`) via `scripts/coverage/.venv/bin/python`.
- Produces: `scripts/test-guard` — computes `BASE="${GUARD_BASE:-$(git merge-base HEAD main 2>/dev/null)}"` (empty → abort), collects changed test files in `BASE..HEAD`, feeds each file's base blob (`git show BASE:path`) and head (worktree/`git show HEAD:path`) to the core, and if any removals exist without an `Allow-test-removal:` trailer in `git log BASE..HEAD` → prints the removed tests and exits non-zero. Exit 0 when no removals, or all acknowledged.

**GREEN obligation:** make `scripts/smoke-test-guard.sh` pass.

- [ ] **Step 1: Write the RED spec** `scripts/smoke-test-guard.sh` (executable) + make targets

The smoke pins end-to-end behaviour with throwaway COMMITS (the ack lives in a commit message), reverted via a trap that restores the saved HEAD. It:
1. Saves `START=$(git rev-parse HEAD)`; `trap 'git reset --hard "$START" >/dev/null 2>&1 || true' EXIT`. Preconditions: clean working tree (abort if dirty — a hard reset would lose work).
2. **Scenario A — unacknowledged removal FAILS:** on a throwaway commit, delete a test function from an existing `*_test.go` (e.g. remove one `func Test...` from `apps/usage-service/internal/usage/event_test.go`), commit WITHOUT a trailer, run `GUARD_BASE=$START scripts/test-guard`. Assert non-zero exit AND output names the removed test. `git reset --hard $START`.
3. **Scenario B — acknowledged removal PASSES:** same deletion, commit WITH `Allow-test-removal: obsolete` trailer, run `GUARD_BASE=$START scripts/test-guard`. Assert exit 0. `git reset --hard $START`.
4. **Scenario C — pure addition PASSES:** commit that ADDS a `func TestZzAdded`, run guard. Assert exit 0.
Prints `SMOKE-TEST-GUARD OK` on success. `make smoke-test-guard` (local-only, `.PHONY`): `scripts/smoke-test-guard.sh`; `make test-guard`: `scripts/test-guard`.

- [ ] **Step 2: Run to confirm RED**

Run: `make smoke-test-guard`
Expected: FAILS — `test-guard` is a stub (`exit 3`), so Scenario A's "names the removed test" and Scenario B/C "exit 0" assertions fail. Tree restored by the trap (verify `git status` clean, HEAD == start).

- [ ] **Step 3: Write the stub** `scripts/test-guard`
```bash
#!/usr/bin/env bash
# test-guard — fail a change that removes tests without an Allow-test-removal
# trailer (photo_ops-mp0). Contract:
# docs/superpowers/specs/2026-07-02-test-integrity-guard-design.md
set -euo pipefail
echo "test-guard: not implemented" >&2
exit 3
```
`chmod +x scripts/test-guard`.

- [ ] **Step 4: Confirm still RED** — `make smoke-test-guard` fails on the stub; `git status` clean + HEAD restored after; `bash -n` clean on both scripts.

- [ ] **Step 5: Commit**
```bash
git add scripts/test-guard scripts/smoke-test-guard.sh Makefile
git commit -m "skeleton(mp0): test-guard orchestrator + RED end-to-end smoke"
```

---

### Task 3: CI — test-guard job on PRs (wiring, no unit RED test)

**Files:**
- Modify: `.github/workflows/ci.yml` — add a `test-guard` job.

**GREEN obligation:** add a PR-only job (`if: github.event_name == 'pull_request'`, `fetch-depth: 0`) that sets up Python 3.12, builds the coverage venv (`make ... `/pip so pytest+the core import work — the core is stdlib-only, so only python3 + the repo on PATH are needed), and runs `GUARD_BASE=${{ github.event.pull_request.base.sha }} make test-guard`. Lighter than coverage-gate: no Go/TS/pnpm needed (the guard is pure Python + git). This layer is config; its correctness is the job definition + Task 2's smoke.

- [ ] **Step 1** Add the `test-guard` job (mirror the coverage-gate job's PR-only + fetch-depth + base-SHA shape; only the Python toolchain).
- [ ] **Step 2** Validate: YAML parses (`python3 -c "import yaml,...; yaml.safe_load(...)"`); confirm PR-only + fetch-depth 0 + `GUARD_BASE` = PR base SHA. CI-runtime deferred to first PR.
- [ ] **Step 3** Commit — `ci(mp0): test-guard job on PRs`.

---

### Task 4: Process rule (prose)

**Files:**
- Modify: `AGENTS.md` — Workflow Rules: the `make test-guard` rule + the `Allow-test-removal: <reason>` trailer convention (when a test is legitimately removed).

**GREEN obligation:** document the concrete rule in AGENTS.md (a few lines; the skills already carry the generic "tests are guarded — don't weaken them"): removing/renaming-away a test or deleting a test file requires an `Allow-test-removal: <reason>` trailer on the commit; `make test-guard` enforces it (also a CI PR job). No skill edits needed (the generic obligation is already there from q2n).

- [ ] **Step 1** Add the rule to `AGENTS.md`.
- [ ] **Step 2** Commit — `docs(mp0): codify the test-removal trailer rule (AGENTS)`.

---

## Self-Review

- **Obligation coverage:** per-language extraction → Task 1 unit tests; removal (incl. deleted file, rename-away) → Task 1; pure-addition-safe → Task 1; ack trailer (with/without reason) → Task 1; end-to-end FAIL/PASS/ack → Task 2 smoke; CI enforcement → Task 3; trailer convention → Task 4. No untested obligation (assertion-weakening is an explicit non-goal → 9n8).
- **Skeleton-failure scan:** unit tests have concrete fixtures + concrete expected sets; stubs raise NotImplementedError; smoke/orchestrator are exit-3 stubs; no GREEN.
- **Type consistency:** `find_test_declarations`/`removed_declarations`/`has_removal_ack`, `GUARD_BASE`, `Allow-test-removal:` named identically across tasks.
- **Reviewable size:** one pure module + 8 unit tests + one orchestrator + one smoke + one CI job + one doc line.
- **No GREEN:** core bodies + orchestrator + smoke assertions-target are the implementer's; the smoke script itself (the RED spec) is authored complete.
- **pytest gotcha:** core names avoid the `test_` prefix so importing them into the test module does not make pytest collect them.
