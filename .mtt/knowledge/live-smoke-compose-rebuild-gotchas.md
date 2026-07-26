---
title: Live-smoke / compose rebuild gotchas
tags:
    - docker
    - grpc
    - smoke
priority: high
created: "2026-07-26T16:53:00Z"
updated: "2026-07-26T16:53:00Z"
---
Rebuilding ANY gRPC-backend service via `compose up -d --build <svc>` leaves api-gateway
holding a stale gRPC connection → `14 UNAVAILABLE ECONNREFUSED :50051` → HTTP 500 on the
first call to that service (identity calls still work, so signup succeeds but e.g.
upload-intent 500s). Fix: `docker compose -f infra/docker/docker-compose.yml --env-file .env
restart api-gateway`, then wait for readiness.

Rebuilding one compose service also recreates its dependency chain and can desync the
cluster-service↔cluster-worker pair (cluster result 'failed', gRPC UNAVAILABLE to
worker:50051) → `up -d --force-recreate cluster-worker cluster-service` before
clustering-dependent smokes. `docker build` cache can fill the disk (ENOSPC mid-build) →
`docker builder prune -af`.
