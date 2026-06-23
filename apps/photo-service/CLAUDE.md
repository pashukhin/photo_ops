# photo-service

## Local context

- Owns the photo upload/list domain; exposes a gRPC API (port `PHOTO_SERVICE_GRPC_PORT`, default 50051).
- Upload flow: `PhotoGrpcController` (`src/photo/photo.grpc.controller.ts`) calls `PhotoDomainService.createUploadIntent` → `PhotoRepository` creates a `photo_assets` row with status `uploading` and a server-generated `objectKey` (`originals/<uuid>/<sanitized-filename>`), then `MinioStorageService` (`src/storage/minio.service.ts`) returns a presigned S3 PUT URL; `CompleteUpload` verifies the object exists in MinIO before marking status `uploaded`.
- List photos scoped by `userId`: `PhotoGrpcController.listPhotos` → `PhotoDomainService.listPhotos` → `PhotoRepository.list` queries `photo_assets` filtered and ordered by `created_at` desc; `userId` is always caller-supplied from the validated session in api-gateway.
- Schema: `migrations/` applied via `make migrate-photo`.
- Tests: `vitest run` (`make test-photo`).

## Local invariants

- Owns and connects only to `photo-db`.
- MinIO object keys are server-generated and independent of raw filenames; originals are private.
- Photo assets are scoped by authenticated `user_id`; cross-service references use UUID v7.
