---
title: Python gRPC service packaging + deploy shape
tags:
    - deploy
    - grpc
    - python
priority: high
created: "2026-07-26T16:53:00Z"
updated: "2026-07-26T16:53:00Z"
---
cluster-service is the FIRST Python gRPC service (s013). Generated grpc-python stubs
(buf.gen.cluster-python.yaml) import from the proto ROOT: `from cluster.v1 import ...`,
`from common.v1 import ...`, `from google.api import annotations_pb2`. Packaging:
(1) put apps/cluster-service/src/photoops_proto on sys.path (pytest
pythonpath=['.','src/photoops_proto']; Dockerfile PYTHONPATH) and import as
`cluster.v1.cluster_service_pb2` (NOT media-worker's `src.photoops_proto.X` style);
(2) dep googleapis-common-protos supplies google.api.annotations_pb2 (do NOT vendor google/api);
(3) dep grpcio for the _pb2_grpc modules.
Deploy shape: monolingual Python, two roles from ONE image (apps/cluster-service):
`server` = gRPC API + cluster.result consumer + ConsumptionEvent emitter; `worker` =
cluster.process consumer (compute+persist). Mirrors photo-service↔media-worker. Self-meters
byte_seconds (RSS sampler) + cpu/wall + a domain counter.
