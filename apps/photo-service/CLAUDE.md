# photo-service

## Local context

- Owns the photo upload/list domain; exposes a gRPC API (port `PHOTO_SERVICE_GRPC_PORT`, default 50051).
- Upload flow: `PhotoGrpcController` (`src/photo/photo.grpc.controller.ts`) calls `PhotoDomainService.createUploadIntent` → `PhotoRepository` creates a `photo_assets` row with status `uploading` and a server-generated `objectKey` (`originals/<uuid>/<sanitized-filename>`), then `MinioStorageService` (`src/storage/minio.service.ts`) returns a presigned S3 PUT URL; `CompleteUpload` verifies the object exists in MinIO before marking status `uploaded`.
- List photos scoped by `userId`: `PhotoGrpcController.listPhotos` → `PhotoDomainService.listPhotos` → `PhotoRepository.list` queries `photo_assets` filtered and ordered by `created_at` desc; `userId` is always caller-supplied from the validated session in api-gateway.
- Schema: `migrations/` applied via `make migrate-photo`.
- Logging / correlation: structured JSON via `nestjs-pino` (`makeLoggerOptions` from `@photoops/observability`); per-RPC lines via `GrpcLoggingInterceptor`. Bridge invariant: the async hop carries the W3C traceparent in the proto `correlation_id` field (`currentTraceparent()` on publish, `withExtractedContext()` on result consume); `job_id` stays the idempotency key.
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
