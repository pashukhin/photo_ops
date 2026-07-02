"""Test-integrity diff-guard core (photo_ops-mp0). Stdlib only.
See docs/superpowers/specs/2026-07-02-test-integrity-guard-design.md."""
from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# Go: match func TestFoo / BenchmarkFoo / FuzzFoo / ExampleFoo in *_test.go
# ---------------------------------------------------------------------------
_GO_DECL = re.compile(r'\bfunc\s+(Test|Benchmark|Fuzz|Example)(\w+)\s*\(')

# ---------------------------------------------------------------------------
# Python: match def test_foo in test_*.py / *_test.py
# ---------------------------------------------------------------------------
_PY_DECL = re.compile(r'^def\s+(test_\w+)\s*\(', re.MULTILINE)

# ---------------------------------------------------------------------------
# TypeScript: match it('title', ...) or test('title', ...) in *.spec/test ts/tsx
# Best-effort: captures the quoted title (single or double quotes).
# ---------------------------------------------------------------------------
_TS_DECL = re.compile(r'\b(?:it|test)\s*\(\s*([\'"])(.*?)\1')


def _is_go_test(path: str) -> bool:
    return path.endswith('_test.go')


def _is_py_test(path: str) -> bool:
    basename = path.rsplit('/', 1)[-1]
    return (basename.startswith('test_') or basename.endswith('_test.py')) and basename.endswith('.py')


def _is_ts_test(path: str) -> bool:
    return bool(re.search(r'\.(?:spec|test)\.tsx?$', path))


def find_test_declarations(path: str, text: str) -> set[str]:
    """Test declarations in `text`, chosen by `path` suffix (Go _test.go,
    Python test_*.py/*_test.py, TS *.spec/*.test .ts/.tsx). set() if `path`
    is not a recognized test file."""
    if _is_go_test(path):
        return {m.group(1) + m.group(2) for m in _GO_DECL.finditer(text)}
    if _is_py_test(path):
        return set(_PY_DECL.findall(text))
    if _is_ts_test(path):
        return {m.group(2) for m in _TS_DECL.finditer(text)}
    return set()


def removed_declarations(
    base: dict[str, str | None], head: dict[str, str | None]
) -> dict[str, list[str]]:
    """Per test file present in `base`, the declarations absent from `head`
    (a None head value = deleted file). Only files with removals; values sorted."""
    result: dict[str, list[str]] = {}
    for path, base_text in base.items():
        if base_text is None:
            # No base text → nothing to remove
            continue
        base_decls = find_test_declarations(path, base_text)
        if not base_decls:
            continue
        head_text = head.get(path)
        if head_text is None:
            # Deleted file — all base decls are removed
            head_decls: set[str] = set()
        else:
            head_decls = find_test_declarations(path, head_text)
        removed = sorted(base_decls - head_decls)
        if removed:
            result[path] = removed
    return result


def has_removal_ack(commit_messages: list[str]) -> bool:
    """True iff some message carries an `Allow-test-removal: <non-empty>` trailer."""
    pattern = re.compile(r'^Allow-test-removal:\s*\S', re.MULTILINE)
    return any(pattern.search(msg) for msg in commit_messages)
