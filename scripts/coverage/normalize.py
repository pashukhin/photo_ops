"""Normalize a cobertura XML report so file paths are repo-root-relative.
See docs/superpowers/specs/2026-07-01-coverage-diff-tooling-design.md."""
from __future__ import annotations


def normalize_cobertura(xml_text: str, source_root: str) -> str:
    """Return `xml_text` with <sources> collapsed to the repo root ('.') and
    each <class filename=...> prefixed by `source_root` (the report's dir
    relative to the repo root, e.g. 'apps/web'), so diff-cover matches
    git-diff paths. Line hit data is preserved unchanged."""
    raise NotImplementedError  # GREEN is the implementer's job


if __name__ == "__main__":  # thin CLI: `normalize.py <source_root> < report.xml`
    import sys

    sys.stdout.write(normalize_cobertura(sys.stdin.read(), sys.argv[1]))
