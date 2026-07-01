# Diff-based Coverage Tooling Skeleton Commit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to fill this skeleton task-by-task — each task makes its RED tests green within the provided stubs. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure new/changed-code coverage across the polyglot repo (Go + TS + Python) as one combined number, exposed as `make coverage-diff` with an opt-in `--fail-under` (default 0 = report-only).

**Architecture / WHY:** Each language runner emits Cobertura XML; a normalizer rewrites paths to repo-root-relative so `diff-cover` (one Python tool) can combine all reports and score only the lines changed vs the merge-base. Entry points: contract → `scripts/coverage-diff`; pure core → `scripts/coverage/normalize.py`; behavior → `scripts/coverage/tests/`. Design note: `docs/superpowers/specs/2026-07-01-coverage-diff-tooling-design.md`. Boundary: this is measurement only; the gate/threshold policy + exSDD skeleton-review wiring is `photo_ops-q2n`.

**Tech Stack:** bash, Python (diff-cover, pytest), `@vitest/coverage-v8`, `gocover-cobertura`, `pytest-cov`. Per-component `.venv` + install-stamp, mirroring the existing `media-worker` Makefile pattern (no uv in this repo).

## Global Constraints

- Python `>=3.12`; env via `python3 -m venv .venv && .venv/bin/pip install`, guarded by a `.install-stamp` (mirror `MW_STAMP` in `Makefile:176`).
- Coverage artifacts and tooling venv are git-ignored (`.coverage/`, `scripts/coverage/.venv/`).
- `coverage-diff` default `--fail-under` = 0 (report-only). Teeth live in `photo_ops-q2n`, NOT here.
- Do NOT add any coverage target to `make gate`.
- Cobertura paths, after normalization, are relative to the repo root (so they match `git diff` paths).

## Non-Goals

- No global per-package % threshold (rejected: noisy against legacy code).
- No `make gate` wiring, no exSDD skeleton-review rule, no return-to-rework loop (that is `photo_ops-q2n`).
- No bespoke lcov/cobertura merger (rejected: `diff-cover` already combines multiple reports).
- No CI wiring in this plan (follow-up once the local target proves out).

---

### Task 1: Cobertura path normalizer (pure core) + tooling env

**Files:**
- Stub: `scripts/coverage/normalize.py` (function raises `NotImplementedError`)
- Test: `scripts/coverage/tests/test_normalize.py` (RED)
- New: `scripts/coverage/requirements.txt` (`diff-cover`, `pytest`)
- Modify: `Makefile` (add `COV_DIR`/`COV_STAMP` venv stamp + `coverage-selftest` target + `.PHONY`)
- New: `.gitignore` entries (`.coverage/`, `scripts/coverage/.venv/`)

**Interfaces:**
- Produces: `normalize_cobertura(xml_text: str, source_root: str) -> str` — collapses `<sources>` to the repo root (`.`) and prefixes each `<class filename=...>` with `source_root`; preserves line hit data.

**GREEN obligation (for the implementer):** make the RED test below pass within the stub. You may add narrower tests; you may not weaken, delete, or rename this RED test.

- [ ] **Step 1: Write the tooling env + selftest harness** (setup folded into this task — the RED test cannot run without it)

`scripts/coverage/requirements.txt`:
```
diff-cover>=9.2
pytest>=8.3
```

Append to `Makefile` (mirror the `MW_STAMP` pattern at `Makefile:173-178`) and add all three targets to `.PHONY`:
```make
COV_DIR := scripts/coverage
COV_STAMP := $(COV_DIR)/.venv/.install-stamp

$(COV_STAMP): $(COV_DIR)/requirements.txt
	cd $(COV_DIR) && python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt
	touch $@

coverage-selftest: $(COV_STAMP)
	$(COV_DIR)/.venv/bin/python -m pytest $(COV_DIR)/tests -q
```

`.gitignore` (create or append):
```
.coverage/
scripts/coverage/.venv/
```

- [ ] **Step 2: Write the RED test** `scripts/coverage/tests/test_normalize.py`

```python
import xml.etree.ElementTree as ET

from scripts.coverage.normalize import normalize_cobertura  # noqa: E402

# A cobertura report as a per-workspace runner emits it: <source> is the
# workspace dir, filenames are relative to that workspace.
WORKSPACE_REPORT = """<?xml version="1.0" ?>
<coverage version="1" timestamp="0" line-rate="0.5">
  <sources><source>/abs/repo/apps/web</source></sources>
  <packages><package name="web" line-rate="0.5"><classes>
    <class name="Foo" filename="components/Foo.tsx" line-rate="0.5">
      <lines>
        <line number="10" hits="1"/>
        <line number="11" hits="0"/>
      </lines>
    </class>
  </classes></package></packages>
</coverage>
"""


def test_paths_become_repo_root_relative():
    # why: diff-cover matches report paths against git-diff paths (repo-root
    # relative); a workspace-relative filename silently scores 0 lines.
    out = normalize_cobertura(WORKSPACE_REPORT, "apps/web")
    tree = ET.fromstring(out)
    assert [s.text for s in tree.findall("./sources/source")] == ["."]
    assert [c.get("filename") for c in tree.iter("class")] == [
        "apps/web/components/Foo.tsx"
    ]


def test_line_hits_are_preserved():
    # why: normalization must not drop coverage data, only rewrite paths.
    out = normalize_cobertura(WORKSPACE_REPORT, "apps/web")
    tree = ET.fromstring(out)
    assert {(l.get("number"), l.get("hits")) for l in tree.iter("line")} == {
        ("10", "1"),
        ("11", "0"),
    }
```

- [ ] **Step 3: Run the test to confirm RED**

Run: `make coverage-selftest`
Expected: `test_normalize.py` FAILS with `NotImplementedError` (not a collection/import error — the module and symbol must resolve).

- [ ] **Step 4: Write the stub signature** `scripts/coverage/normalize.py`

```python
"""Normalize a cobertura XML report so file paths are repo-root-relative.
See docs/superpowers/specs/2026-07-01-coverage-diff-tooling-design.md."""
from __future__ import annotations


def normalize_cobertura(xml_text: str, source_root: str) -> str:
    """Return `xml_text` with <sources> collapsed to the repo root ('.') and
    each <class filename=...> prefixed by `source_root` (the report's dir
    relative to the repo root, e.g. 'apps/web'), so diff-cover matches
    git-diff paths. Line hit data is preserved unchanged."""
    raise NotImplementedError  # GREEN is the implementer's job


if __name__ == "__main__":  # thin CLI: `normalize.py <source_root> < report.xml`
    import sys

    sys.stdout.write(normalize_cobertura(sys.stdin.read(), sys.argv[1]))
```

Also add empty `scripts/coverage/__init__.py` and `scripts/coverage/tests/__init__.py` so `from scripts.coverage.normalize import ...` resolves (run pytest from repo root).

- [ ] **Step 5: Confirm still RED + import resolves**

Run: `make coverage-selftest`
Expected: FAILS on `NotImplementedError` raised from a resolved symbol (no ImportError).

- [ ] **Step 6: Commit the skeleton**

```bash
git add scripts/coverage Makefile .gitignore
git commit -m "skeleton(osq): cobertura path normalizer (RED test + stub)"
```

---

### Task 2: coverage-diff orchestrator (integration)

**Files:**
- Stub: `scripts/coverage-diff` (bash; body prints not-implemented and `exit 3`)
- Test: `scripts/coverage/tests/test_coverage_diff.py` (RED integration — builds a tmp git repo + injects a fixture cobertura, asserts report + exit semantics)

**Interfaces:**
- Consumes: `normalize_cobertura` (Task 1) for auto-discovered reports; `--coverage-file` injects an already-normalized report and skips normalization. Resolves `diff-cover` from `scripts/coverage/.venv/bin/diff-cover`, PATH fallback.
- Produces: CLI `scripts/coverage-diff [--base REF] [--fail-under N] [--coverage-file PATH]... [--skip-generate] [--report PATH]`. Defaults: `--base` = `$COVERAGE_BASE` or `main`; `--fail-under` = `$COVERAGE_FAIL_UNDER` or `0`; `--report` = `.coverage/diff.md`. Exit code = `diff-cover`'s (0 when new-code coverage ≥ fail-under). Writes a markdown report naming uncovered new lines.

**GREEN obligation (for the implementer):** make the RED tests below pass within the stub. You may add narrower tests; you may not weaken, delete, or rename these RED tests.

- [ ] **Step 1: Write the RED test** `scripts/coverage/tests/test_coverage_diff.py`

```python
import subprocess
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "coverage-diff"  # scripts/coverage-diff

# Injected report: new line 3 covered, new line 4 uncovered -> 50% new-code cov.
COBERTURA = """<?xml version="1.0" ?>
<coverage version="1" timestamp="0" line-rate="0.5">
  <sources><source>.</source></sources>
  <packages><package name="src" line-rate="0.5"><classes>
    <class name="app" filename="src/app.py" line-rate="0.5">
      <lines>
        <line number="3" hits="1"/>
        <line number="4" hits="0"/>
      </lines>
    </class>
  </classes></package></packages>
</coverage>
"""


def _git(repo, *args):
    subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True)


def _make_repo(tmp_path):
    repo = tmp_path / "repo"
    (repo / "src").mkdir(parents=True)
    _git(repo, "init", "-q")
    _git(repo, "config", "user.email", "t@t")
    _git(repo, "config", "user.name", "t")
    (repo / "src" / "app.py").write_text("def a():\n    return 1\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "base")
    _git(repo, "branch", "-M", "main")
    _git(repo, "switch", "-q", "-c", "feature")
    # add two NEW lines (become lines 3 and 4)
    (repo / "src" / "app.py").write_text("def a():\n    return 1\ndef b():\n    return 2\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "feature")
    (repo / "cov.xml").write_text(COBERTURA)
    return repo


def _run(repo, *args):
    return subprocess.run(
        [str(SCRIPT), "--skip-generate", "--coverage-file", "cov.xml",
         "--base", "main", "--report", ".coverage/diff.md", *args],
        cwd=repo, capture_output=True, text=True,
    )


def test_fails_under_threshold_and_reports_uncovered_new_line(tmp_path):
    # why: 50% new-code coverage < 100 must fail and the report must name the file.
    repo = _make_repo(tmp_path)
    r = _run(repo, "--fail-under", "100")
    report = repo / ".coverage" / "diff.md"
    assert r.returncode != 0
    assert report.exists()
    assert "src/app.py" in report.read_text()


def test_passes_at_zero_threshold(tmp_path):
    # why: default report-only mode (fail-under 0) never fails the build (teeth = q2n).
    repo = _make_repo(tmp_path)
    r = _run(repo, "--fail-under", "0")
    assert r.returncode == 0
```

- [ ] **Step 2: Run the test to confirm RED**

Run: `make coverage-selftest`
Expected: both tests FAIL — `test_passes_at_zero_threshold` fails because the stub exits 3, and `test_fails_under_threshold...` fails because no report is written. (Behavior failures, not missing-file: the script exists and runs.)

- [ ] **Step 3: Write the stub** `scripts/coverage-diff`

```bash
#!/usr/bin/env bash
# coverage-diff — combine polyglot cobertura reports and score new/changed-code
# coverage via diff-cover. Contract:
# docs/superpowers/specs/2026-07-01-coverage-diff-tooling-design.md
set -euo pipefail
echo "coverage-diff: not implemented" >&2
exit 3
```
Make it executable: `chmod +x scripts/coverage-diff`.

- [ ] **Step 4: Confirm still RED**

Run: `make coverage-selftest`
Expected: both integration tests still FAIL on behavior (stub exits 3, writes no report); Task 1's normalize tests unaffected.

- [ ] **Step 5: Commit the skeleton**

```bash
git add scripts/coverage-diff scripts/coverage/tests/test_coverage_diff.py
git commit -m "skeleton(osq): coverage-diff orchestrator (RED integration test + stub)"
```

---

### Task 3: Live per-language coverage generation + Make surface (smoke-verified)

**Files:**
- Modify: `Makefile` — `coverage` (run all three runners → normalized cobertura at known paths under `.coverage/`), `coverage-diff` (invoke `scripts/coverage-diff`); add to `.PHONY`.
- Modify: `apps/web/vitest.config.ts`, `packages/observability/vitest.config.ts` (+ any other vitest config) — enable `@vitest/coverage-v8` with the `cobertura` reporter.
- Modify: `apps/media-worker/pyproject.toml` — add `pytest-cov` to the `dev` group; coverage run emits `--cov-report=xml`.
- Modify: `apps/usage-service` Go tooling — `go test -coverprofile` + `gocover-cobertura` conversion (add the tool).

**GREEN obligation (for the implementer):** wire the three runners so `make coverage` produces one normalized cobertura XML per language under `.coverage/`, and `make coverage-diff` runs `scripts/coverage-diff` end-to-end. This is wiring, not new algorithm — its correctness is proven by the smoke below, not a new unit test.

- [ ] **Step 1: Stub the Make targets** (so the skeleton commit carries the surface)

```make
coverage:
	@echo "coverage: not implemented" >&2; exit 3

coverage-diff: $(COV_STAMP)
	@echo "coverage-diff target: not implemented" >&2; exit 3
```

- [ ] **Step 2: Commit the surface stub**

```bash
git add Makefile
git commit -m "skeleton(osq): make coverage/coverage-diff target stubs"
```

- [ ] **Step 3 (GREEN — implementer): executable smoke acceptance**

Per `photo_ops-dqb` (executable smoke where a change crosses tool boundaries — here three coverage toolchains). After wiring, on this feature branch:

Run: `make coverage && make coverage-diff`
Expected observations (the acceptance):
1. `.coverage/` contains one cobertura XML per language, each with repo-root-relative paths (spot-check a `<class filename=...>` starts with `apps/`/`packages/`).
2. `make coverage-diff` exits 0 (default fail-under 0) and writes `.coverage/diff.md` reporting a combined new-code coverage number that covers changed lines from more than one language — proving normalization aligns paths live across all three runners.

If any language's paths do not resolve (diff-cover reports 0 changed lines for files that did change), that is the path-alignment bug — fix `normalize_cobertura`'s `source_root` for that runner and re-run; do not weaken the Task 1/2 tests.

---

## Self-Review

- **Obligation coverage:** new-code metric + combined report → Task 2 integration test; path normalization (the risk) → Task 1 unit test + Task 3 live smoke; `--fail-under` default 0 / opt-in teeth → both Task 2 tests; live 3-language wiring → Task 3 smoke. No gate/threshold-policy obligation here (that is q2n, a non-goal).
- **Skeleton-failure scan:** no TBD/TODO; both RED tests have concrete fixtures + concrete asserts; stubs raise/exit not-implemented; no GREEN written.
- **Type consistency:** `normalize_cobertura(xml_text, source_root)` consumed identically in Task 2's interface note and the `scripts/coverage-diff` contract.
- **Reviewable size:** 2 RED tests + 2 stubs + Make/gitignore diff. Task 3 is wiring + a smoke, not code to review line-by-line.
- **No GREEN:** normalizer body and script body are not-implemented; Make feature targets are stubs.
