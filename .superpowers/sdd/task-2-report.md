# Task 2 Report: Orchestrator `scripts/test-guard` (photo_ops-mp0)

## Status: DONE

## I/O Split Design

Chose the Python CLI entrypoint approach described in the task brief:

- **`scripts/testguard/cli.py`** — the I/O layer. All git calls (`subprocess`) live here.
  - `_git(*args)` — thin wrapper over `subprocess.run(["git", ...])`.
  - `_git_blob(ref, path)` — returns text or `None` if the blob doesn't exist (`git show ref:path`).
  - `main(base)` — orchestrates: diff changed files, fetch blobs, call `removed_declarations`, check `has_removal_ack`, report and exit.
- **`scripts/test-guard`** (bash, 20 lines) — computes `BASE` (from `GUARD_BASE` env or `git merge-base HEAD main`) then `exec`s `scripts/coverage/.venv/bin/python -m scripts.testguard.cli "${BASE}"`.
- **`scripts/testguard/guard.py`** — **untouched**. Purely functional; no subprocess/filesystem added.

The commit-message ack check passes the full `git log BASE..HEAD --format=%B` output as a single string to `has_removal_ack([log_out])`. Since `has_removal_ack` uses `re.MULTILINE`, `^Allow-test-removal:` matches at any line boundary in the concatenated output — robust regardless of message paragraph structure.

## TDD Evidence: RED → GREEN

### RED (pre-implementation)
`scripts/test-guard` was an exit-3 stub. `make smoke-test-guard` would fail at Scenario A — guard exits 3 which is non-zero but output doesn't name the removed test.

### GREEN
After implementation:
```
$ make smoke-test-guard
scripts/smoke-test-guard.sh
smoke-test-guard: scenario A — unacknowledged removal must FAIL and name the test...
smoke-test-guard: scenario B — acknowledged removal must PASS...
smoke-test-guard: scenario C — pure addition must PASS...

SMOKE-TEST-GUARD OK — unacknowledged removal fails, acknowledged removal & addition pass
```

### Core unit tests (guard.py untouched)
```
$ make test-guard-selftest
scripts/coverage/.venv/bin/python -m pytest scripts/testguard/tests -q
........                                                       [100%]
8 passed in 0.01s
```

## Tree / HEAD Restoration Confirmation

After `make smoke-test-guard`:
- `git status --porcelain --untracked-files=no` → empty (clean tracked tree)
- `git rev-parse HEAD` → `1f91b03730e2cf7eef163a07f962dc8e6844c5b7` (implementation commit, not a throwaway)

## Files Changed

| File | Change |
|------|--------|
| `scripts/test-guard` | Replaced exit-3 stub with bash wrapper that computes BASE and delegates to Python CLI |
| `scripts/testguard/cli.py` | New — git I/O orchestrator (subprocess, imports pure core) |
| `scripts/testguard/guard.py` | **Unchanged** |
| `scripts/smoke-test-guard.sh` | **Unchanged** |
| `scripts/testguard/tests/test_guard.py` | **Unchanged** |

## Commit

```
1f91b03 impl(mp0/task-2): test-guard orchestrator -> GREEN
```

## Concerns

None. The I/O split is clean; the pure core has no subprocess/IO leakage; the smoke harness restores state correctly via its trap.

---

## Review Fix Report (code-review findings, applied 2026-07-02)

### Fix 1 — `scripts/test-guard`: cd to REPO_ROOT before exec (Important)

`cd "${REPO_ROOT}"` added immediately before the `exec` line. Without this,
`-m scripts.testguard.cli` raises `ModuleNotFoundError: No module named 'scripts'`
whenever the caller's CWD is not the repo root. The smoke test masked this because
it cd's first.

### Fix 2 — `scripts/testguard/cli.py`: `_git()` raises on non-zero exit (Minor, gate-integrity)

Added `if result.returncode != 0: raise RuntimeError(...)` in `_git()`. A bad BASE ref
or any other git failure now exits 1 (fail-closed) instead of returning "" and
silently passing a zero diff. `main()` body wrapped in `try/except RuntimeError` to
print the error to stderr and return 1. `_git_blob()` left unchanged — `None` is the
intentional sentinel for "file absent/deleted".

### Fix 3 — `scripts/testguard/cli.py`: docstring invocation corrected (Minor)

Module docstring updated from `python cli.py <base_ref>` to
`python -m scripts.testguard.cli <base_ref>` to match actual invocation.

### Verification

- `bash -n scripts/test-guard` → OK
- `make smoke-test-guard` → `SMOKE-TEST-GUARD OK`, exit 0
- `git status --porcelain --untracked-files=no` after smoke → empty (tree restored)
- `make test-guard-selftest` → 8 passed in 0.01s

### Commit

```
0b4b32d fix(mp0/task-2): test-guard cd repo-root; _git raises on failure; docstring
```

---

## Final-review fix: normalize CI base to merge-base (2026-07-02)

### Finding (Important, photo_ops-mp0 final review)

`cli.py` used two-dot `git diff base..HEAD`. In CI, `GUARD_BASE` is the base-branch
TIP sha — NOT an ancestor of HEAD once main advances after the branch point. Two-dot
diff then includes files changed on main (not by the PR), and `removed_declarations`
reports their declarations as "removed by this PR" — a false positive that fails a
clean PR.

### One-line fix applied (`scripts/testguard/cli.py`)

Inserted immediately after the empty-base guard, before the first `_git("diff", ...)`:

```python
base = _git("merge-base", base, "HEAD").strip()
```

`merge-base(base, HEAD)` is the true fork point. Idempotent for the local path (where
base is already `git merge-base HEAD main`). Corrects the CI path (base.sha tip →
fork point). Aligns with the three-dot/merge-base semantics the coverage gate uses.
`guard.py` untouched.

### Verification

1. **`make smoke-test-guard`**
   ```
   SMOKE-TEST-GUARD OK — unacknowledged removal fails, acknowledged removal & addition pass
   ```
   Exit 0. Tracked tree + HEAD restored (normalization is idempotent when base is
   already the ancestor — behaviour unchanged for all three scenarios).

2. **`make test-guard-selftest`**
   ```
   8 passed in 0.01s
   ```

3. **Divergent-base regression repro**

   Scenario: `main` advances past the branch point of `feat` (feat never touched the file).

   ```
   === Two-dot diff (BUG): git diff --name-only <main-tip>..<feat-head> ===
   a_test.go
   (expected: a_test.go — spurious false positive)

   === Merge-base normalized diff (FIX): git diff --name-only <merge-base>..<feat-head> ===
   (expected: empty — no files changed on feat)

   merge-base == fork point: YES
   ```

   Two-dot diff incorrectly surfaces `a_test.go` (changed on main, not on feat).
   After merge-base normalization the diff is empty — the false positive is eliminated.

### Commit

```
aa87252 fix(mp0): normalize CI base to merge-base (avoid false removals when main advanced)
```
