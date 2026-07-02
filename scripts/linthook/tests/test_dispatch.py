from scripts.linthook.dispatch import Linter, linter_for


def test_ts_and_tsx_use_eslint():
    # why: TS files lint via the repo's flat-config eslint; non-zero exit = issue.
    assert linter_for("apps/web/app/page.tsx") == Linter(
        ["pnpm", "exec", "eslint", "apps/web/app/page.tsx"], "exit"
    )
    assert linter_for("packages/observability/src/x.ts") == Linter(
        ["pnpm", "exec", "eslint", "packages/observability/src/x.ts"], "exit"
    )


def test_media_worker_python_uses_ruff():
    # why: media-worker .py has a configured ruff; scope ruff to it.
    p = "apps/media-worker/src/media_worker/config.py"
    assert linter_for(p) == Linter(
        ["apps/media-worker/.venv/bin/ruff", "check", p], "exit"
    )


def test_non_media_worker_python_is_skipped():
    # why: scripts/*.py have no configured ruff -> skip (avoid noise).
    assert linter_for("scripts/coverage/normalize.py") is None


def test_go_uses_gofmt_output_mode():
    # why: gofmt -l exits 0 always; non-empty stdout means misformatted.
    assert linter_for("apps/usage-service/internal/usage/event.go") == Linter(
        ["gofmt", "-l", "apps/usage-service/internal/usage/event.go"], "output"
    )


def test_unknown_suffix_is_skipped():
    # why: only known source suffixes are linted; everything else is a no-op.
    assert linter_for("README.md") is None
    assert linter_for("package.json") is None
