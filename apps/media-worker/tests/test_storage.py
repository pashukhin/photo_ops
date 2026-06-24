"""Tests for the ObjectStore Protocol contract using FakeObjectStore.

MinioObjectStore itself is covered by the Task 4.2 integration test; no live
MinIO is required here.
"""

from tests.fakes import FakeObjectStore


def test_upload_download_round_trip() -> None:
    store = FakeObjectStore()
    data = b"hello world"
    size = store.upload("img/photo.jpg", data, "image/jpeg", {"job-id": "abc"})
    assert size == len(data)
    assert store.download("img/photo.jpg") == data


def test_head_returns_stored_metadata() -> None:
    store = FakeObjectStore()
    meta = {"job-id": "xyz", "width": "1920"}
    store.upload("img/photo.jpg", b"bytes", "image/jpeg", meta)
    result = store.head("img/photo.jpg")
    assert result == meta


def test_head_of_missing_key_returns_none() -> None:
    store = FakeObjectStore()
    assert store.head("nonexistent/key.jpg") is None
