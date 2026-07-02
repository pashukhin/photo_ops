"""test-guard CLI — wires the pure core to git (photo_ops-mp0).

Invoked by `scripts/test-guard` as:
    python cli.py <base_ref>

Reads git state; delegates purely to guard.py for detection logic.
"""
from __future__ import annotations

import subprocess
import sys

from scripts.testguard.guard import has_removal_ack, removed_declarations


def _git(*args: str) -> str:
    """Run a git command and return stdout (decoded, no trailing newline)."""
    result = subprocess.run(
        ["git", *args],
        capture_output=True,
        text=True,
    )
    return result.stdout


def _git_blob(ref: str, path: str) -> str | None:
    """Return the text of `path` at `ref`, or None if absent (deleted/not tracked)."""
    result = subprocess.run(
        ["git", "show", f"{ref}:{path}"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return None
    return result.stdout


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: cli.py <base-ref>", file=sys.stderr)
        return 2

    base = sys.argv[1].strip()
    if not base:
        print("test-guard: BASE ref is empty — cannot determine merge-base", file=sys.stderr)
        return 1

    # Changed files between base and HEAD
    diff_out = _git("diff", "--name-only", f"{base}..HEAD")
    changed_files = [f for f in diff_out.splitlines() if f.strip()]

    if not changed_files:
        return 0

    # Build base and head text dicts for changed files
    base_texts: dict[str, str | None] = {}
    head_texts: dict[str, str | None] = {}

    for path in changed_files:
        base_texts[path] = _git_blob(base, path)
        head_texts[path] = _git_blob("HEAD", path)

    # Delegate detection to pure core
    removals = removed_declarations(base_texts, head_texts)

    if not removals:
        return 0

    # Check for acknowledgment trailer in commit messages.
    # Pass the full log as a single string — has_removal_ack uses re.MULTILINE
    # so it finds the trailer at any line start regardless of message boundaries.
    log_out = _git("log", f"{base}..HEAD", "--format=%B")
    if has_removal_ack([log_out]):
        return 0

    # Report the removed declarations and exit non-zero
    print("test-guard: test declarations removed without Allow-test-removal trailer:", file=sys.stderr)
    for path, names in sorted(removals.items()):
        for name in names:
            print(f"  {path}: {name}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
