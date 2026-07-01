import xml.etree.ElementTree as ET

from scripts.coverage.normalize import normalize_cobertura

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
