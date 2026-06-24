from __future__ import annotations

import io
from typing import Protocol, cast

import minio
import minio.error

from .config import Config

_AMZMETA_PREFIX = "x-amz-meta-"


class ObjectStore(Protocol):
    def download(self, object_key: str) -> bytes: ...

    def upload(
        self,
        object_key: str,
        data: bytes,
        content_type: str,
        metadata: dict[str, str],
    ) -> int: ...

    def head(self, object_key: str) -> dict[str, str] | None: ...


class MinioObjectStore:
    """ObjectStore implementation backed by MinIO / S3."""

    def __init__(self, config: Config) -> None:
        endpoint = config.minio_endpoint
        # Strip scheme to get host:port and determine TLS.
        if endpoint.startswith("https://"):
            host = endpoint[len("https://"):]
            secure = True
        elif endpoint.startswith("http://"):
            host = endpoint[len("http://"):]
            secure = False
        else:
            # No scheme — assume plain host:port, no TLS.
            host = endpoint
            secure = False

        self._bucket = config.minio_bucket
        self._client = minio.Minio(
            host,
            access_key=config.minio_access_key,
            secret_key=config.minio_secret_key,
            secure=secure,
        )

    def download(self, object_key: str) -> bytes:
        response = self._client.get_object(self._bucket, object_key)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def upload(
        self,
        object_key: str,
        data: bytes,
        content_type: str,
        metadata: dict[str, str],
    ) -> int:
        self._client.put_object(
            self._bucket,
            object_key,
            io.BytesIO(data),
            length=len(data),
            content_type=content_type,
            metadata=cast(dict[str, str | list[str] | tuple[str]], metadata),
        )
        return len(data)

    def head(self, object_key: str) -> dict[str, str] | None:
        try:
            stat = self._client.stat_object(self._bucket, object_key)
        except minio.error.S3Error as exc:
            if exc.code == "NoSuchKey":
                return None
            raise
        # stat.metadata is a urllib3.HTTPHeaderDict; keys are lower-cased HTTP
        # headers like "x-amz-meta-job-id".  Strip the prefix to return plain
        # keys such as "job-id".
        result: dict[str, str] = {}
        if stat.metadata:
            for key, value in stat.metadata.items():
                lower = key.lower()
                if lower.startswith(_AMZMETA_PREFIX):
                    plain_key = lower[len(_AMZMETA_PREFIX):]
                    result[plain_key] = value
        return result
