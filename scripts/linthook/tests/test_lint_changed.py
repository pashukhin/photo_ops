import json
import os
import subprocess
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "lint-changed"  # scripts/lint-changed
BAD_GO = "package x\nfunc  F(){\n}\n"   # gofmt-misformatted (double space)
GOOD_GO = "package x\n\nfunc F() {}\n"  # gofmt-clean


def _run(file_path, env=None):
    payload = json.dumps({"tool_input": {"file_path": str(file_path)}})
    return subprocess.run(
        [str(SCRIPT)], input=payload, capture_output=True, text=True, env=env
    )


def test_misformatted_go_reports_and_exits_2(tmp_path):
    # why: an issue on the edited file must feed back to the agent (exit 2, named).
    f = tmp_path / "bad.go"
    f.write_text(BAD_GO)
    r = _run(f)
    assert r.returncode == 2
    assert "bad.go" in (r.stderr + r.stdout)


def test_clean_go_exits_0_silently(tmp_path):
    # why: a clean file must not interrupt the agent.
    f = tmp_path / "good.go"
    f.write_text(GOOD_GO)
    assert _run(f).returncode == 0


def test_lint_hook_disabled_exits_0(tmp_path):
    # why: LINT_HOOK=0 is the session escape valve — no linting.
    f = tmp_path / "bad.go"
    f.write_text(BAD_GO)
    env = {**os.environ, "LINT_HOOK": "0"}
    assert _run(f, env=env).returncode == 0


def test_unknown_suffix_exits_0(tmp_path):
    # why: non-source files are a no-op.
    f = tmp_path / "notes.md"
    f.write_text("# hi")
    assert _run(f).returncode == 0
