# PhotoOps Architecture Frame Design

Date: 2026-06-21

## Context

PhotoOps is a web platform for turning a personal photo bank into annotated photo publications. The MVP must demonstrate a complete product path from uploading photos to publishing a shareable story, while also serving as a portfolio case for backend, platform, and product engineering.

This design defines the initial architectural frame for the project. The first executable version must start locally, show a working vertical slice, and return explicit errors for domains that are not implemented yet.

This document describes the architecture frame, not the full MVP. The full MVP ends with a published public photo story. The first executable frame ends with upload/list.

## Goals

- Establish the production-shaped architecture before feature development starts.
- Keep service ownership boundaries clear from day one.
- Provide one working vertical slice: JPEG upload via presigned MinIO URL and photo listing.
- Scaffold the rest of the platform so unimplemented areas fail explicitly.
- Produce a staged backlog with dependencies for further development.

## Non-Goals

- Full photo processing in the first executable frame.
- Clustering implementation in the first executable frame.
- Publication workflow in the first executable frame.
- Telegram connector in the first executable frame.
- Production deployment, Kubernetes, or real billing.
- UI visual design exploration in this session.

## Architecture

PhotoOps starts as a polyglot, contract-first, domain-service system. Services are separate deployable units from day one, but the first executable frame stays intentionally thin: only the upload/list photo slice is implemented end to end. Other services start and answer with explicit `UNIMPLEMENTED` or `501 Not Implemented` responses.

Components:

- `web`: Next.js and TypeScript browser UI and future public pages.
- `api-gateway`: NestJS and TypeScript public HTTP/BFF entrypoint for the frontend.
- `photo-service`: domain owner for upload intent, photo assets, object keys, photo status, and variant metadata.
- `media-worker`: Python worker for EXIF extraction, auto-orientation, thumbnail generation, and preview generation.
- `cluster-service`: Go service for deterministic clustering and reclustering based on metadata.
- `publication-service`: domain owner for posts, post photos, visibility, and publish/unpublish workflow.
- `usage-service`: domain owner for append-only usage/billing ledger and usage summary.
- `connector-service`: domain owner for external share attempts and connectors such as Telegram.
- `postgres`: local Postgres runtime hosting separate databases and users per data-owning service.
- `minio`: S3-compatible object storage for originals and generated variants.
- `rabbitmq`: async command/event/job broker.

The browser talks only to `api-gateway` over HTTP/JSON. `api-gateway` calls domain services via generated gRPC clients. Domain services are not browser-facing. Presigned MinIO upload URLs are the only direct browser-to-infrastructure path, and they are short-lived and server-generated.

## Data Ownership

The core ownership rule is: a service owns the data it creates and changes.

Data-owning services have separate databases from day one:

- `photo-service` uses `photo-db` with `photo_user`.
- `cluster-service` uses `cluster-db` with `cluster_user`.
- `publication-service` uses `publication-db` with `publication_user`.
- `usage-service` uses `usage-db` with `usage_user`.
- `connector-service` uses `connector-db` with `connector_user`.

Non-owning components:

- `web` has no database.
- `api-gateway` has no database in the initial frame.
- `media-worker` has no database in the initial frame; it communicates with `photo-service`, MinIO, and RabbitMQ through explicit contracts.

Local development uses one Postgres container with multiple database/user pairs. This keeps local operations simple while making ownership violations visible in review through unexpected connection strings or credentials.

Rules:

- A service connects only to its own database.
- Cross-service references use UUID v7.
- Cross-service reads happen through gRPC/internal APIs, events, snapshots, or materialized read models.
- Cross-domain foreign keys are not available and are not an architectural dependency.
- A new `DATABASE_URL` in a service is a review-sensitive change.
- Migration and persistence tooling are selected per service according to its stack.

For the first frame, only `photo-db` requires real schema. The other databases can exist with empty initial migrations or only enough structure for service readiness.

## Contracts And Tooling

Sync APIs are contract-first. `.proto` files are the source of truth.

Initial proto layout:

- `proto/photo/v1/photo_service.proto`
- `proto/cluster/v1/cluster_service.proto`
- `proto/publication/v1/publication_service.proto`
- `proto/usage/v1/usage_service.proto`
- `proto/connector/v1/connector_service.proto`
- `proto/common/v1/*.proto`

Tooling:

- `buf` for linting, generation, and future breaking-change checks.
- `google.api.http` annotations for HTTP/JSON mapping.
- Generated Go stubs/clients for Go services.
- Generated TypeScript clients/stubs for NestJS gateway and TypeScript services.
- Generated Python clients/stubs only where Python needs gRPC.
- OpenAPI is generated from proto for browser documentation.
- gRPC reflection is enabled in local development.
- `grpcurl` and `grpcui` are used for debugging.

Async contracts use RabbitMQ for long-running work. AsyncAPI is added when the first real async contracts appear, such as `photo.process.requested`, `photo.process.completed`, and `cluster.generate.requested`.

Unimplemented gRPC methods return `UNIMPLEMENTED`. Public HTTP/BFF endpoints for unimplemented domains return `501 Not Implemented`.

## First Executable Slice

The first executable frame proves the infrastructure and one vertical path:

```text
web -> api-gateway -> photo-service -> MinIO + photo-db -> web
```

Working scenario:

1. User opens `web`.
2. UI shows backend service status and an upload form.
3. User selects a JPEG file.
4. `web` calls `api-gateway` to create an upload intent.
5. `api-gateway` calls `photo-service`.
6. `photo-service` creates a `PhotoAsset` with UUID v7, server-generated object key, and status `uploading`.
7. `photo-service` generates a presigned MinIO PUT URL.
8. `web` uploads the file directly to MinIO.
9. `web` calls `CompleteUpload` through `api-gateway`.
10. `photo-service` verifies that the object exists in MinIO and changes status to `uploaded`.
11. `web` lists uploaded photos through `ListPhotos`.

Initial photo statuses:

- `uploading`
- `uploaded`
- `processing`
- `ready`
- `failed`

In the first frame, `CompleteUpload` leaves the photo in `uploaded`. Transitions to `processing`, `ready`, and `failed` are introduced when `media-worker` is connected.

Not implemented in the first frame:

- EXIF extraction.
- Thumbnail and preview generation.
- Real media processing.
- Clustering.
- Publication workflow.
- Usage aggregation.
- Telegram connector.

All services still start in Docker Compose and provide health endpoints. Domain APIs that are not ready return explicit errors.

## Repository And Runtime

The repository is a polyglot monorepo with simple top-level control.

Structure:

```text
apps/
  web/
  api-gateway/
  photo-service/
  media-worker/
  cluster-service/
  publication-service/
  usage-service/
  connector-service/
proto/
  photo/v1/
  cluster/v1/
  publication/v1/
  usage/v1/
  connector/v1/
  common/v1/
packages/
  ts-proto/
  ui/
infra/
  docker/
  postgres/
  minio/
  rabbitmq/
docs/
  adr/
  architecture.md
  roadmap.md
```

Tooling:

- `pnpm workspace` for TypeScript components and shared packages.
- Go module for `cluster-service`.
- Python project for `media-worker`.
- Top-level `Makefile` with `make dev`, `make test`, `make proto`, `make migrate`, and `make lint`.
- Docker Compose for local runtime.
- CI later runs install, proto generation/linting, builds, and tests.

Local runtime services:

- `web`
- `api-gateway`
- `photo-service`
- `media-worker`
- `cluster-service`
- `publication-service`
- `usage-service`
- `connector-service`
- `postgres`
- `minio`
- `rabbitmq`

Documentation:

- `README.md`: quickstart, service list, and thin slice demo.
- `docs/architecture.md`: system overview and decisions.
- `docs/roadmap.md`: staged backlog and dependencies.
- `docs/adr/*.md`: individual architectural decisions.

## Error Handling And Observability

Upload flow errors:

- `CreateUploadIntent` rejects unsupported `content_type` values.
- `CreateUploadIntent` rejects files above the configured size limit.
- `CompleteUpload` returns a clear error if the object key is missing in MinIO.
- Expired or unfinished uploads remain in `uploading` until cleanup exists.
- Cleanup for abandoned uploads is a later hardening task, but the status model supports it from the start.

Service errors:

- Unimplemented gRPC methods return `UNIMPLEMENTED`.
- Unimplemented public HTTP endpoints return `501 Not Implemented`.
- Gateway maps inter-service failures into a stable JSON error shape.
- Known error causes should not be hidden as generic `500` responses.

Observability baseline:

- All services emit structured logs.
- `api-gateway` creates or accepts `x-correlation-id`.
- Correlation ID propagates through gRPC metadata and RabbitMQ messages.
- All services expose health endpoints.
- Data-owning services expose readiness checks that verify their own database connection.
- `photo-service` readiness also checks MinIO access.
- Services that publish or consume events check RabbitMQ availability in readiness.

Security and privacy baseline:

- Originals are not public.
- Public pages use prepared variants once media processing exists.
- Presigned upload URLs are short-lived.
- Object keys are generated server-side and do not come from filenames.
- Sensitive EXIF is not shown publicly.
- Browser clients do not directly access domain service endpoints.

## Backlog And Staging

### Stage 0: Project Frame

Result: monorepo, Docker Compose, proto tooling, docs skeleton, service health checks, and DB-per-service setup.

Dependencies: none.

### Stage 1: Upload Thin Slice

Result: `web -> api-gateway -> photo-service -> MinIO/photo-db`, presigned PUT upload, complete upload, and list photos.

Dependencies: Stage 0.

### Stage 2: Media Processing

Result: RabbitMQ command/result contracts, Python `media-worker`, EXIF extraction, auto-orientation, thumbnails/previews, and statuses `processing`, `ready`, `failed`.

Dependencies: Stage 1.

### Stage 3: Usage Ledger

Result: `usage-service`, append-only events for original storage, variant generation, photo processing, and a simple usage dashboard.

Dependencies: Stage 1 and part of Stage 2.

### Stage 4: Clustering

Result: Go `cluster-service`, metadata snapshot/input contract, deterministic clustering by time/place, cluster list, and cluster detail.

Dependencies: Stage 2 and minimum location metadata.

### Stage 5: Publication

Result: `publication-service`, draft creation from cluster, title/body/caption/order editing, publish/unpublish, and public/unlisted page.

Dependencies: Stage 4.

### Stage 6: Sharing And Connector

Result: share text, copy link, and optional Telegram connector with status and errors.

Dependencies: Stage 5.

### Stage 7: Product Polish

Result: empty/loading/error states, demo dataset, screenshots, README/demo docs, and known limitations.

Dependencies: Stages 1 through 6.

### Stage 8: Observability And Hardening

Result: structured logs, correlation IDs, job duration/failure logs, cleanup for abandoned uploads, and basic metrics.

Dependencies: can start after Stage 1 and deepen after Stage 2.

## Accepted Decisions

- Use separate deployable domain services from day one.
- Use Next.js for `web`.
- Use NestJS for `api-gateway`.
- Use Python for media processing worker responsibilities.
- Use Go for clustering service responsibilities.
- Use DB-per-data-owning-service from day one.
- Use one local Postgres container with multiple databases/users.
- Use UUID v7 for domain identifiers and cross-service references.
- Use proto-first sync contracts with `google.api.http` annotations.
- Use RabbitMQ for async work and add AsyncAPI once real event contracts exist.
- Use presigned MinIO PUT plus `CompleteUpload` for first upload flow.
- Keep browser access limited to `api-gateway`, except for presigned MinIO uploads.
