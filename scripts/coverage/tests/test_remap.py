"""Tests for remap_cobertura_paths — the Go cobertura path normalizer.

gocover-cobertura v1.2.0 (go-1.23-compatible) emits workspace-relative
filenames with the absolute workspace path as <source>.  The transform
replaces a leading old_prefix on each <class filename> with new_prefix and
collapses <sources> to "." so diff-cover can match paths against git-diff.

Real observed shape (usage-service):
  <source>/home/.../apps/usage-service</source>
  <class filename="internal/amqp/consumer.go" ...>

Target repo-root-relative:
  <class filename="apps/usage-service/internal/amqp/consumer.go" ...>

With old_prefix="" and new_prefix="apps/usage-service" the leading ""
matches any filename (strip nothing, prepend new_prefix) which is the
correct transform for the Go case.
"""
from __future__ import annotations

import xml.etree.ElementTree as ET

from scripts.coverage.normalize import remap_cobertura_paths

# Fixture mirrors the real gocover-cobertura v1.2.0 output shape:
# <source> is absolute path, <class filename> is module-relative (no
# import-path prefix — just the workspace-relative path).
GO_REPORT = """<?xml version="1.0" encoding="UTF-8"?>
<coverage version="1" timestamp="0" line-rate="0.5">
  <sources><source>/abs/repo/apps/usage-service</source></sources>
  <packages><package name="internal/usage" line-rate="0.5"><classes>
    <class name="-" filename="internal/usage/event.go" line-rate="0.5">
      <lines>
        <line number="5" hits="1"/>
        <line number="6" hits="0"/>
      </lines>
    </class>
    <class name="-" filename="internal/amqp/consumer.go" line-rate="0.3">
      <lines>
        <line number="20" hits="1"/>
      </lines>
    </class>
  </classes></package></packages>
</coverage>
"""


def test_remap_sources_collapsed_to_dot():
    # why: diff-cover needs <sources><source>.</source></sources> so it
    # resolves filenames relative to the repo root.
    out = remap_cobertura_paths(GO_REPORT, old_prefix="", new_prefix="apps/usage-service")
    tree = ET.fromstring(out)
    assert [s.text for s in tree.findall("./sources/source")] == ["."]


def test_remap_filenames_become_repo_root_relative():
    # why: gocover-cobertura emits workspace-relative paths; diff-cover
    # matches against git-diff which uses repo-root-relative paths.
    out = remap_cobertura_paths(GO_REPORT, old_prefix="", new_prefix="apps/usage-service")
    tree = ET.fromstring(out)
    filenames = [c.get("filename") for c in tree.iter("class")]
    assert filenames == [
        "apps/usage-service/internal/usage/event.go",
        "apps/usage-service/internal/amqp/consumer.go",
    ]


def test_remap_line_hits_preserved():
    # why: remap must not drop coverage data, only rewrite paths.
    out = remap_cobertura_paths(GO_REPORT, old_prefix="", new_prefix="apps/usage-service")
    tree = ET.fromstring(out)
    hits = {(l.get("number"), l.get("hits")) for l in tree.iter("line")}
    assert hits == {("5", "1"), ("6", "0"), ("20", "1")}


def test_remap_strips_import_path_prefix():
    # why: verify that a non-empty old_prefix is stripped and replaced,
    # covering the originally-feared import-path shape.
    import_path_report = GO_REPORT.replace(
        'filename="internal/usage/event.go"',
        'filename="github.com/photoops/usage-service/internal/usage/event.go"',
    ).replace(
        'filename="internal/amqp/consumer.go"',
        'filename="github.com/photoops/usage-service/internal/amqp/consumer.go"',
    )
    out = remap_cobertura_paths(
        import_path_report,
        old_prefix="github.com/photoops/usage-service",
        new_prefix="apps/usage-service",
    )
    tree = ET.fromstring(out)
    filenames = [c.get("filename") for c in tree.iter("class")]
    assert filenames == [
        "apps/usage-service/internal/usage/event.go",
        "apps/usage-service/internal/amqp/consumer.go",
    ]
