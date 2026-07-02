"""UUID v7 id minting (cross-service id convention)."""
from __future__ import annotations

from uuid6 import uuid7 as _uuid7


def uuid7() -> str:
    """A fresh time-ordered UUID v7 as a string."""
    return str(_uuid7())
