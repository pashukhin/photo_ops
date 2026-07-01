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
