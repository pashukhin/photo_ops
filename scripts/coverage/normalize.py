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


def remap_cobertura_paths(xml_text: str, old_prefix: str, new_prefix: str) -> str:
    """Return `xml_text` with <sources> collapsed to '.' and each
    <class filename=...> rewritten by stripping a leading `old_prefix` and
    prepending `new_prefix`, producing repo-root-relative paths.

    Designed for Go: gocover-cobertura emits workspace-relative filenames
    (e.g. ``internal/usage/event.go``) with the absolute workspace dir as
    <source>.  Call with old_prefix="" and new_prefix="apps/usage-service"
    to convert to repo-root-relative paths (``apps/usage-service/internal/…``).
    If gocover-cobertura ever switches to import-path filenames (e.g.
    ``github.com/photoops/usage-service/internal/…``), pass that import path
    as old_prefix and the module's repo-relative dir as new_prefix.

    Line hit data is preserved unchanged."""
    tree = ET.ElementTree(ET.fromstring(xml_text))
    root = tree.getroot()

    # Collapse all <source> elements to the repo root so diff-cover resolves
    # class filenames relative to the repo root.
    for source in root.findall(".//sources/source"):
        source.text = "."

    # Strip old_prefix and prepend new_prefix on each <class filename=...>.
    for cls in root.findall(".//class"):
        filename = cls.get("filename")
        if filename is None:
            continue
        if old_prefix and filename.startswith(old_prefix):
            filename = filename[len(old_prefix):].lstrip("/")
        cls.set("filename", f"{new_prefix}/{filename}")

    return ET.tostring(root, encoding="unicode")


if __name__ == "__main__":
    import sys

    mode = sys.argv[1] if len(sys.argv) > 1 else "prefix"
    if mode == "remap":
        # Usage: normalize.py remap <old_prefix> <new_prefix> < report.xml
        sys.stdout.write(remap_cobertura_paths(sys.stdin.read(), sys.argv[2], sys.argv[3]))
    else:
        # Usage: normalize.py <source_root> < report.xml  (original prefix mode)
        sys.stdout.write(normalize_cobertura(sys.stdin.read(), sys.argv[1]))
