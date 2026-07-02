"""Domain errors for cluster-service."""
from __future__ import annotations


class UnknownMethodError(ValueError):
    """Raised when a clustering method id is not in the registry."""

    def __init__(self, method_id: str) -> None:
        super().__init__(f"unknown clustering method: {method_id!r}")
        self.method_id = method_id
