from __future__ import annotations


class FakeObjectStore:
    """In-memory implementation of the ObjectStore Protocol for use in tests."""

    def __init__(self) -> None:
        # Stores: {object_key: (data, content_type, metadata)}
        self._store: dict[str, tuple[bytes, str, dict[str, str]]] = {}

    def download(self, object_key: str) -> bytes:
        if object_key not in self._store:
            raise FileNotFoundError(f"Object not found: {object_key!r}")
        return self._store[object_key][0]

    def upload(
        self,
        object_key: str,
        data: bytes,
        content_type: str,
        metadata: dict[str, str],
    ) -> int:
        self._store[object_key] = (data, content_type, metadata)
        return len(data)

    def head(self, object_key: str) -> dict[str, str] | None:
        if object_key not in self._store:
            return None
        return self._store[object_key][2]
