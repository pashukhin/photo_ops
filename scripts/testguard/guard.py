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
