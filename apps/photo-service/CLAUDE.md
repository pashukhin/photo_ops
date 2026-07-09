# photo-service

## Local context

- Owns the photo upload/list domain; exposes a gRPC API (port `PHOTO_SERVICE_GRPC_PORT`, default 50051).
- Upload flow: `PhotoGrpcController` (`src/photo/photo.grpc.controller.ts`) calls `PhotoDomainService.createUploadIntent` → `PhotoRepository` creates a `photo_assets` row with status `uploading` and a server-generated `objectKey` (`originals/<uuid>/<sanitized-filename>`), then `MinioStorageService` (`src/storage/minio.service.ts`) returns a presigned S3 PUT URL; `CompleteUpload` verifies the object exists in MinIO before marking status `uploaded`.
- List photos scoped by `userId`: `PhotoGrpcController.listPhotos` → `PhotoDomainService.listPhotos` → `PhotoRepository.list`. Server-side query (session 011): `ListPhotosParams` = `{ userId, page (1-based), pageSize, sortBy (created_at|taken_at|filename|size_bytes), sortDir, statusFilter[], filenameQuery }`; the repo builds one filtered/sorted/paginated query + a `COUNT(*)` and returns `{ rows, totalCount }`; the service composes variant views and threads `totalCount` (→ `ListPhotosResult`). The gRPC controller is the proto↔domain boundary: it maps the numeric proto enums and applies defaults/clamps (page→1, pageSize 0→24 then clamp 1..100, sortBy→created_at, sortDir→desc). `userId` is always caller-supplied from the validated session in api-gateway. The list SQL is covered by `make smoke-ui` + manual e2e, not an in-process DB test (testcontainers = `photo_ops-4vg`).
- Schema: `migrations/` applied via `make migrate-photo` (each SQL file is hardcoded there — add a line per new migration).
- Location / reverse-geocoding (session 022 / ADR-0007): `finalizeResult` (past the opm winner-gate) decodes `attributes.place` (the offline-geocoded place from media-worker), `normalizePlace`s it (trim + `null→''`, **no lower-case**), reads the representative `lat`/`lon` from `raw_provider_data`, and `upsertLocation`s a deduped `locations` row (idempotent `ON CONFLICT (5-tuple) DO UPDATE … RETURNING id`), then links `photo_assets.location_id`. Read side: `getPhoto`/`listPhotos` compose the place via a batched `listLocationsByIds` (mirrors the variant compose); `toProtoPhoto` maps it to `PhotoAsset.location` (proto `GeoPlace`, reused via cross-import). No place → `location_id` null, still `ready`. Dedup fires only against the real `''` values (nullable tuple columns would silently not dedup) — asserted live by `make smoke-media` (same-city count delta), not a unit test (no in-process DB, `4vg`). Session 023 (`9q4.3`): `SetPhotoLocation` (grpc controller → `PhotoDomainService.setPhotoLocation`) is the **manual** location path — `normalizePlace` → `upsertLocation({…, rawProviderData:{source:'manual'}})` → owner-scoped `setLocationForUser` (`UPDATE … WHERE id AND user_id` — do NOT reuse the unscoped `applyAttributes`) writes `photo_assets.{location_id, lat, lon}` (the map-clicked point, optional), then re-composes via `getPhoto`; throws exactly `'photo not found'` (→ gRPC `NOT_FOUND`) when the write matches no row. `photo_assets.lat/lon` is now "the photo's known point: EXIF **or** a manual override" (ADR-0007 §4). The service orchestration is unit-tested with a fake repo; the `WHERE user_id` SQL + the IDOR guard are smoke-only (`make smoke-clusters`: set-location round-trip + a negative foreign-id → NOT_FOUND).
- Logging / correlation: structured JSON via `nestjs-pino`, configured by `makePinoHttpOptions` from `@photoops/observability` (wraps `makeLoggerOptions` — redaction + trace_id/span_id mixin); per-RPC lines via `GrpcLoggingInterceptor`. Bridge invariant: the async hop carries the W3C traceparent in the proto `correlation_id` field (`currentTraceparent()` on publish, `withExtractedContext()` on result consume); `job_id` stays the idempotency key.
- Tests: `vitest run` (`make test-photo`).
- Typecheck: `tsc --noEmit` (`make typecheck` runs it across all services).

## Messaging (RabbitMQ producer + result consumer)

- `src/messaging/rabbitmq-bus.ts` — `RabbitMqBus` implements both `MessagePublisher` and `MessageConsumer` ports via `amqplib`. A single shared instance (DI token `RABBITMQ_BUS`) is opened at startup and used for both publishing jobs and consuming results.
- `MESSAGE_PUBLISHER` DI token is bound to the shared `RabbitMqBus` instance via `useExisting`.
- `ProcessingResultConsumer` (`src/photo/processing.consumer.ts`) is started in `main.ts` after `startAllMicroservices()`.
- Job destination: `photo.process` (publishes `ProcessPhotoJob` protobuf messages).
- Result source: `photo.result` (consumes `PhotoProcessingResult` protobuf messages).

## Broker topology (canonical — mirrored by media-worker Python adapter)

For each logical name `N` (`photo.process`, `photo.result`):
- Exchange `N`, type `direct`, durable.
- Exchange `N.dlx`, type `direct`, durable (dead-letter exchange).
- Queue `N.dlq`, durable; bound to `N.dlx` with routing key `N` (not `N.dlq`).
- Queue `N`, durable, `x-dead-letter-exchange = N.dlx`; bound to exchange `N` with routing key `N`.

**Do NOT change topology constants without updating both sides** (`src/messaging/rabbitmq-bus.ts` and `apps/media-worker/src/media_worker/messaging/rabbitmq.py`) in the same commit. Any mismatch in durable flags, DLX arg key, or DLQ binding routing key will cause `PRECONDITION_FAILED` when services race to declare the same queue.

## Local invariants

- Owns and connects only to `photo-db`.
- MinIO object keys are server-generated and independent of raw filenames; originals are private.
- Photo assets are scoped by authenticated `user_id`; cross-service references use UUID v7.
- `RabbitMqBus` is not instantiated in unit tests — it requires a live broker. It is covered by the Task 4.2 integration test. Unit tests use the `InMemoryBus` fake.
