"""Normalize a cobertura XML report so file paths are repo-root-relative.
See docs/superpowers/specs/2026-07-01-coverage-diff-tooling-design.md."""
from __future__ import annotations

import xml.etree.ElementTree as ET


def normalize_cobertura(xml_text: str, source_root: str) -> str:
    """Return `xml_text` with <sources> collapsed to the repo root ('.') and
    each <class filename=...> prefixed by `source_root` (the report's dir
    relative to the repo root, e.g. 'apps/web'), so diff-cover matches
    git-diff paths. Line hit data is preserved unchanged."""
    tree = ET.ElementTree(ET.fromstring(xml_text))
    root = tree.getroot()

    # Replace all <source> elements with "."
    for source in root.findall(".//sources/source"):
        source.text = "."

    # Prefix each <class filename=...> with source_root
    for cls in root.findall(".//class"):
        filename = cls.get("filename")
        if filename is not None:
            cls.set("filename", f"{source_root}/{filename}")

    return ET.tostring(root, encoding="unicode")


if __name__ == "__main__":  # thin CLI: `normalize.py <source_root> < report.xml`
    import sys

    sys.stdout.write(normalize_cobertura(sys.stdin.read(), sys.argv[1]))
