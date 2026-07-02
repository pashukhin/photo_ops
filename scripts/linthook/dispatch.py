"""Edit-time lint hook — pure suffix->linter dispatch (photo_ops-8d5). Stdlib only.
See docs/superpowers/specs/2026-07-02-lint-hook-design.md."""
from __future__ import annotations

from typing import NamedTuple


class Linter(NamedTuple):
    cmd: list[str]
    issue_on: str  # "exit" (non-zero code) or "output" (non-empty stdout)


def linter_for(path: str) -> Linter | None:
    """The fast per-file linter for `path`, or None to skip. See the design
    note / plan Global Constraints for the suffix -> (command, issue_on) map:
    *.ts/*.tsx -> eslint (exit); *.py under apps/media-worker/ -> ruff (exit);
    *.go -> gofmt -l (output); anything else -> None."""
    if path.endswith((".ts", ".tsx")):
        return Linter(["pnpm", "exec", "eslint", path], "exit")
    if path.endswith(".py"):
        if "apps/media-worker/" in path:
            return Linter(["apps/media-worker/.venv/bin/ruff", "check", path], "exit")
        return None
    if path.endswith(".go"):
        return Linter(["gofmt", "-l", path], "output")
    return None
