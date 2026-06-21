# Architecture Frame Upload Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first executable architecture frame: all planned services start locally, and the upload/list photo slice works end to end.

**Architecture:** The browser talks to a NestJS `api-gateway` over HTTP/JSON. The gateway calls a NestJS `photo-service` over generated gRPC contracts. `photo-service` owns `photo-db`, creates presigned MinIO PUT URLs, verifies completed uploads, and lists photo assets. Other domain services start with health checks and explicit unimplemented responses.

**Tech Stack:** pnpm workspace, Next.js, NestJS, TypeScript, ts-proto, Buf, gRPC, Drizzle, PostgreSQL, MinIO, RabbitMQ, Docker Compose, Python worker scaffold, Go service scaffold.

---

## Implementation Notes

Code blocks in this plan are implementation hints and starting points, not immutable API specifications. During execution, prefer the smallest working adjustment when framework tooling, generated proto names, Docker packaging, or path resolution differs from the written snippet. Do not expand scope while making those adjustments: if the choice is between a more polished scaffold and getting the first JPEG into the uploaded list, choose the JPEG in the list.

## Scope

This plan implements the architecture frame, not the full MVP. The full MVP ends with a published public photo story. This plan ends with upload/list.

Implemented end to end:

- local monorepo and runtime frame;
- proto-first contracts for the first photo slice;
- `web -> api-gateway -> photo-service -> MinIO + photo-db -> web`;
- health endpoints for all runtime services;
- explicit unimplemented responses for non-photo domains.

Non-photo services expose HTTP health-only scaffolds in this frame. Their gRPC contracts are defined in proto, but gRPC servers are wired only when the corresponding stage starts.

Not implemented in this plan:

- EXIF extraction;
- thumbnails/previews;
- media job processing;
- clustering;
- publication workflow;
- usage aggregation;
- Telegram connector.

## File Structure

Create this structure:

```text
apps/
  web/
    app/page.tsx
    app/globals.css
    app/layout.tsx
    lib/api.ts
    package.json
    next.config.js
    tsconfig.json
  api-gateway/
    src/main.ts
    src/app.module.ts
    src/http/photo.controller.ts
    src/http/health.controller.ts
    src/grpc/photo.client.ts
    src/errors/http-error.filter.ts
    package.json
    tsconfig.json
    nest-cli.json
  photo-service/
    src/main.ts
    src/app.module.ts
    src/photo/photo.grpc.controller.ts
    src/photo/photo.repository.ts
    src/photo/photo.service.ts
    src/photo/photo.types.ts
    src/storage/minio.service.ts
    src/db/client.ts
    src/db/schema.ts
    src/health/health.controller.ts
    migrations/0001_create_photo_assets.sql
    package.json
    tsconfig.json
    nest-cli.json
  media-worker/
    src/main.py
    pyproject.toml
  cluster-service/
    cmd/server/main.go
    go.mod
  publication-service/
    src/main.ts
    package.json
    tsconfig.json
  usage-service/
    src/main.ts
    package.json
    tsconfig.json
  connector-service/
    src/main.ts
    package.json
    tsconfig.json
proto/
  buf.yaml
  buf.gen.yaml
  common/v1/common.proto
  photo/v1/photo_service.proto
  cluster/v1/cluster_service.proto
  publication/v1/publication_service.proto
  usage/v1/usage_service.proto
  connector/v1/connector_service.proto
infra/
  docker/docker-compose.yml
  postgres/init/001-create-databases.sql
  minio/create-bucket.sh
packages/
  proto-ts/
    package.json
    src/.gitkeep
docs/
  architecture.md
  roadmap.md
  adr/0001-architecture-frame.md
scripts/
  smoke-upload.sh
Makefile
package.json
pnpm-workspace.yaml
.env.example
.gitignore
README.md
```

Ownership boundaries:

- `apps/photo-service` is the only application connecting to `PHOTO_DATABASE_URL`.
- `apps/api-gateway` has no `DATABASE_URL`.
- `apps/web` has no `DATABASE_URL`.
- `apps/media-worker` has no database in this frame.
- Other domain service scaffolds do not connect to databases until their domain tasks begin.

## Task 1: Root Tooling And Documentation Frame

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `Makefile`
- Create: `README.md`
- Create: `docs/architecture.md`
- Create: `docs/roadmap.md`
- Create: `docs/adr/0001-architecture-frame.md`

- [ ] **Step 1: Create root workspace files**

Create `package.json`:

```json
{
  "name": "photo-ops",
  "private": true,
  "packageManager": "pnpm@9.15.4",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "proto": "buf generate proto"
  },
  "devDependencies": {
    "@bufbuild/buf": "^1.50.0"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Create `.gitignore`:

```gitignore
node_modules/
.next/
dist/
coverage/
.env
.env.local
*.log
__pycache__/
.venv/
bin/
tmp/
data/
```

- [ ] **Step 2: Create environment contract**

Create `.env.example`:

```dotenv
WEB_PORT=3000
API_GATEWAY_PORT=3001
PHOTO_SERVICE_GRPC_PORT=50051

POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_SUPERUSER=postgres
POSTGRES_SUPERPASS=postgres

PHOTO_DATABASE_URL=postgres://photo_user:photo_pass@postgres:5432/photo_db
CLUSTER_DATABASE_URL=postgres://cluster_user:cluster_pass@postgres:5432/cluster_db
PUBLICATION_DATABASE_URL=postgres://publication_user:publication_pass@postgres:5432/publication_db
USAGE_DATABASE_URL=postgres://usage_user:usage_pass@postgres:5432/usage_db
CONNECTOR_DATABASE_URL=postgres://connector_user:connector_pass@postgres:5432/connector_db

MINIO_ENDPOINT=http://minio:9000
MINIO_BROWSER_ENDPOINT=http://localhost:9000
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
MINIO_BUCKET=photo-ops-originals

RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

- [ ] **Step 3: Create Makefile commands**

Create `Makefile`:

```makefile
.PHONY: install proto build test lint dev down logs status migrate-photo smoke-upload

install:
	pnpm install

proto:
	pnpm proto

build:
	pnpm build

test:
	pnpm test

lint:
	pnpm lint

dev:
	docker compose -f infra/docker/docker-compose.yml --env-file .env up --build

down:
	docker compose -f infra/docker/docker-compose.yml --env-file .env down

logs:
	docker compose -f infra/docker/docker-compose.yml --env-file .env logs -f

status:
	docker compose -f infra/docker/docker-compose.yml --env-file .env ps

migrate-photo:
	docker compose -f infra/docker/docker-compose.yml --env-file .env exec -T postgres psql "$${PHOTO_DATABASE_URL}" < apps/photo-service/migrations/0001_create_photo_assets.sql

smoke-upload:
	scripts/smoke-upload.sh
```

- [ ] **Step 4: Create documentation stubs with concrete scope**

Create `README.md`:

```markdown
# PhotoOps

PhotoOps is a web platform for turning a personal photo bank into annotated photo publications.

This repository currently implements the architecture frame, not the full MVP. The full MVP ends with a published public photo story. The first executable frame ends with upload/list.

## Local Quickstart

```bash
cp .env.example .env
make install
make proto
make dev
```

Open `http://localhost:3000`.

## First Executable Slice

The first working path is:

```text
web -> api-gateway -> photo-service -> MinIO + photo-db -> web
```

It supports creating an upload intent, uploading a JPEG directly to MinIO with a presigned PUT URL, completing the upload, and listing uploaded photos.
```

Create `docs/architecture.md`:

```markdown
# Architecture

The accepted architecture frame is documented in `docs/superpowers/specs/2026-06-21-photoops-architecture-frame-design.md`.
```

Create `docs/roadmap.md`:

```markdown
# Roadmap

1. Project frame.
2. Upload thin slice.
3. Media processing.
4. Usage ledger.
5. Clustering.
6. Publication.
7. Sharing/connectors.
8. Product polish and hardening.
```

Create `docs/adr/0001-architecture-frame.md`:

```markdown
# ADR-0001: Architecture Frame

## Status

Accepted

## Decision

PhotoOps starts as a polyglot, contract-first, domain-service system with separate deployable services and DB-per-data-owning-service.

## Consequences

The first executable frame has more scaffolding than a monolith, but service ownership violations are easier to detect and future extraction work is reduced.
```

- [ ] **Step 5: Verify root files**

Run: `test -f package.json && test -f pnpm-workspace.yaml && test -f Makefile && test -f README.md`

Expected: command exits with status `0` and prints no output.

- [ ] **Step 6: Commit root frame**

```bash
git add package.json pnpm-workspace.yaml .gitignore .env.example Makefile README.md docs/architecture.md docs/roadmap.md docs/adr/0001-architecture-frame.md
git commit -m "chore: add project frame tooling"
```

## Task 2: Proto Contracts And TypeScript Generation

**Files:**

- Create: `proto/buf.yaml`
- Create: `proto/buf.gen.yaml`
- Create: `proto/common/v1/common.proto`
- Create: `proto/photo/v1/photo_service.proto`
- Create: `proto/cluster/v1/cluster_service.proto`
- Create: `proto/publication/v1/publication_service.proto`
- Create: `proto/usage/v1/usage_service.proto`
- Create: `proto/connector/v1/connector_service.proto`
- Create: `packages/proto-ts/package.json`
- Create: `packages/proto-ts/src/.gitkeep`

- [ ] **Step 1: Create Buf configuration**

Create `proto/buf.yaml`:

```yaml
version: v2
modules:
  - path: .
lint:
  use:
    - STANDARD
breaking:
  use:
    - FILE
deps:
  - buf.build/googleapis/googleapis
```

Create `proto/buf.gen.yaml`:

```yaml
version: v2
managed:
  enabled: true
plugins:
  - remote: buf.build/community/stephenh-ts-proto
    out: ../packages/proto-ts/src
    opt:
      - nestJs=true
      - outputServices=grpc-js
      - esModuleInterop=true
      - forceLong=string
      - useExactTypes=false
```

- [ ] **Step 2: Create common proto types**

Create `proto/common/v1/common.proto`:

```proto
syntax = "proto3";

package photoops.common.v1;

message Empty {}

message HealthCheckRequest {}

message HealthCheckResponse {
  string status = 1;
  string service = 2;
}

message ErrorResponse {
  string code = 1;
  string message = 2;
  string correlation_id = 3;
}
```

- [ ] **Step 3: Create photo service proto**

Create `proto/photo/v1/photo_service.proto`:

```proto
syntax = "proto3";

package photoops.photo.v1;

import "google/api/annotations.proto";
import "common/v1/common.proto";

service PhotoService {
  rpc Health(photoops.common.v1.HealthCheckRequest) returns (photoops.common.v1.HealthCheckResponse) {
    option (google.api.http) = { get: "/v1/photo/health" };
  }

  rpc CreateUploadIntent(CreateUploadIntentRequest) returns (CreateUploadIntentResponse) {
    option (google.api.http) = {
      post: "/v1/photos/upload-intents"
      body: "*"
    };
  }

  rpc CompleteUpload(CompleteUploadRequest) returns (PhotoAsset) {
    option (google.api.http) = {
      post: "/v1/photos/{photo_id}/complete-upload"
      body: "*"
    };
  }

  rpc ListPhotos(ListPhotosRequest) returns (ListPhotosResponse) {
    option (google.api.http) = { get: "/v1/photos" };
  }
}

message CreateUploadIntentRequest {
  string filename = 1;
  string content_type = 2;
  string size_bytes = 3;
}

message CreateUploadIntentResponse {
  string photo_id = 1;
  string object_key = 2;
  string upload_url = 3;
  string expires_at = 4;
}

message CompleteUploadRequest {
  string photo_id = 1;
}

message ListPhotosRequest {
  int32 page_size = 1;
  string page_token = 2;
}

message ListPhotosResponse {
  repeated PhotoAsset photos = 1;
  string next_page_token = 2;
}

message PhotoAsset {
  string id = 1;
  string filename = 2;
  string content_type = 3;
  string size_bytes = 4;
  string object_key = 5;
  PhotoStatus status = 6;
  string created_at = 7;
  string updated_at = 8;
}

enum PhotoStatus {
  PHOTO_STATUS_UNSPECIFIED = 0;
  PHOTO_STATUS_UPLOADING = 1;
  PHOTO_STATUS_UPLOADED = 2;
  PHOTO_STATUS_PROCESSING = 3;
  PHOTO_STATUS_READY = 4;
  PHOTO_STATUS_FAILED = 5;
}
```

- [ ] **Step 4: Create unimplemented domain protos**

Create `proto/cluster/v1/cluster_service.proto`:

```proto
syntax = "proto3";

package photoops.cluster.v1;

import "google/api/annotations.proto";
import "common/v1/common.proto";

service ClusterService {
  rpc Health(photoops.common.v1.HealthCheckRequest) returns (photoops.common.v1.HealthCheckResponse) {
    option (google.api.http) = { get: "/v1/cluster/health" };
  }

  rpc GenerateClusters(GenerateClustersRequest) returns (GenerateClustersResponse) {
    option (google.api.http) = {
      post: "/v1/clusters/generate"
      body: "*"
    };
  }
}

message GenerateClustersRequest {
  string scope = 1;
}

message GenerateClustersResponse {
  string job_id = 1;
}
```

Create `proto/publication/v1/publication_service.proto`:

```proto
syntax = "proto3";

package photoops.publication.v1;

import "google/api/annotations.proto";
import "common/v1/common.proto";

service PublicationService {
  rpc Health(photoops.common.v1.HealthCheckRequest) returns (photoops.common.v1.HealthCheckResponse) {
    option (google.api.http) = { get: "/v1/publication/health" };
  }

  rpc CreateDraftFromCluster(CreateDraftFromClusterRequest) returns (CreateDraftFromClusterResponse) {
    option (google.api.http) = {
      post: "/v1/posts/from-cluster"
      body: "*"
    };
  }
}

message CreateDraftFromClusterRequest {
  string cluster_id = 1;
}

message CreateDraftFromClusterResponse {
  string post_id = 1;
}
```

Create `proto/usage/v1/usage_service.proto`:

```proto
syntax = "proto3";

package photoops.usage.v1;

import "google/api/annotations.proto";
import "common/v1/common.proto";

service UsageService {
  rpc Health(photoops.common.v1.HealthCheckRequest) returns (photoops.common.v1.HealthCheckResponse) {
    option (google.api.http) = { get: "/v1/usage/health" };
  }

  rpc GetUsageSummary(GetUsageSummaryRequest) returns (GetUsageSummaryResponse) {
    option (google.api.http) = { get: "/v1/usage/summary" };
  }
}

message GetUsageSummaryRequest {}

message GetUsageSummaryResponse {
  string estimated_monthly_cost = 1;
}
```

Create `proto/connector/v1/connector_service.proto`:

```proto
syntax = "proto3";

package photoops.connector.v1;

import "google/api/annotations.proto";
import "common/v1/common.proto";

service ConnectorService {
  rpc Health(photoops.common.v1.HealthCheckRequest) returns (photoops.common.v1.HealthCheckResponse) {
    option (google.api.http) = { get: "/v1/connector/health" };
  }

  rpc CreateShareText(CreateShareTextRequest) returns (CreateShareTextResponse) {
    option (google.api.http) = {
      post: "/v1/connectors/share-text"
      body: "*"
    };
  }
}

message CreateShareTextRequest {
  string post_id = 1;
}

message CreateShareTextResponse {
  string text = 1;
}
```

- [ ] **Step 5: Create generated TypeScript package shell**

Create `packages/proto-ts/package.json`:

```json
{
  "name": "@photoops/proto-ts",
  "private": true,
  "version": "0.0.0",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "@grpc/grpc-js": "^1.12.6",
    "@grpc/proto-loader": "^0.7.13",
    "@nestjs/microservices": "^10.4.15",
    "protobufjs": "^7.4.0",
    "rxjs": "^7.8.1"
  }
}
```

Create `packages/proto-ts/src/.gitkeep` as an empty file.

- [ ] **Step 6: Generate proto files and verify**

Run: `pnpm install && pnpm proto`

Expected: command exits with status `0` and generated TypeScript files appear under `packages/proto-ts/src`.

- [ ] **Step 7: Commit proto contracts**

```bash
git add proto packages/proto-ts package.json pnpm-lock.yaml
git commit -m "feat: add proto contracts"
```

## Task 3: Local Infrastructure Runtime

**Files:**

- Create: `infra/docker/docker-compose.yml`
- Create: `infra/postgres/init/001-create-databases.sql`
- Create: `infra/minio/create-bucket.sh`

- [ ] **Step 1: Create database bootstrap SQL**

Create `infra/postgres/init/001-create-databases.sql`:

```sql
CREATE USER photo_user WITH PASSWORD 'photo_pass';
CREATE DATABASE photo_db OWNER photo_user;

CREATE USER cluster_user WITH PASSWORD 'cluster_pass';
CREATE DATABASE cluster_db OWNER cluster_user;

CREATE USER publication_user WITH PASSWORD 'publication_pass';
CREATE DATABASE publication_db OWNER publication_user;

CREATE USER usage_user WITH PASSWORD 'usage_pass';
CREATE DATABASE usage_db OWNER usage_user;

CREATE USER connector_user WITH PASSWORD 'connector_pass';
CREATE DATABASE connector_db OWNER connector_user;
```

- [ ] **Step 2: Create MinIO bucket script**

Create `infra/minio/create-bucket.sh`:

```sh
#!/usr/bin/env sh
set -eu

mc alias set local "http://minio:9000" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc mb --ignore-existing "local/$MINIO_BUCKET"
mc anonymous set none "local/$MINIO_BUCKET"
```

- [ ] **Step 3: Create Docker Compose runtime**

Create `infra/docker/docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_SUPERUSER}
      POSTGRES_PASSWORD: ${POSTGRES_SUPERPASS}
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ../postgres/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_SUPERUSER}"]
      interval: 5s
      timeout: 3s
      retries: 20

  minio:
    image: minio/minio:RELEASE.2025-01-20T14-49-07Z
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio-data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 3s
      retries: 20

  minio-init:
    image: minio/mc:RELEASE.2025-01-17T23-25-50Z
    depends_on:
      minio:
        condition: service_healthy
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
      MINIO_BUCKET: ${MINIO_BUCKET}
    volumes:
      - ../minio/create-bucket.sh:/create-bucket.sh:ro
    entrypoint: ["/bin/sh", "/create-bucket.sh"]

  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    ports:
      - "5672:5672"
      - "15672:15672"
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "ping"]
      interval: 5s
      timeout: 3s
      retries: 20

volumes:
  postgres-data:
  minio-data:
```

- [ ] **Step 4: Verify infrastructure starts**

Run: `cp .env.example .env && docker compose -f infra/docker/docker-compose.yml --env-file .env up -d postgres minio minio-init rabbitmq`

Expected: command exits with status `0`.

- [ ] **Step 5: Verify database isolation exists**

Run: `docker compose -f infra/docker/docker-compose.yml --env-file .env exec postgres psql -U postgres -c "SELECT datname FROM pg_database WHERE datname IN ('photo_db','cluster_db','publication_db','usage_db','connector_db') ORDER BY datname;"`

Expected output includes exactly these database names: `cluster_db`, `connector_db`, `photo_db`, `publication_db`, `usage_db`.

- [ ] **Step 6: Commit infrastructure runtime**

```bash
git add infra/docker/docker-compose.yml infra/postgres/init/001-create-databases.sql infra/minio/create-bucket.sh
git commit -m "chore: add local infrastructure runtime"
```

## Task 4: Photo Service Database And Unit Tests

**Files:**

- Create: `apps/photo-service/package.json`
- Create: `apps/photo-service/tsconfig.json`
- Create: `apps/photo-service/nest-cli.json`
- Create: `apps/photo-service/migrations/0001_create_photo_assets.sql`
- Create: `apps/photo-service/src/db/schema.ts`
- Create: `apps/photo-service/src/photo/photo.types.ts`
- Create: `apps/photo-service/src/photo/photo.service.spec.ts`

- [ ] **Step 1: Create photo-service package**

Create `apps/photo-service/package.json`:

```json
{
  "name": "@photoops/photo-service",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "test": "vitest run",
    "lint": "eslint src --ext .ts"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.723.0",
    "@aws-sdk/s3-request-presigner": "^3.723.0",
    "@grpc/grpc-js": "^1.12.6",
    "@nestjs/common": "^10.4.15",
    "@nestjs/core": "^10.4.15",
    "@nestjs/microservices": "^10.4.15",
    "drizzle-orm": "^0.38.4",
    "pg": "^8.13.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "uuidv7": "^1.0.2"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.8",
    "@types/node": "^22.10.5",
    "@types/pg": "^8.11.10",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

Create `apps/photo-service/tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2022",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

Create `apps/photo-service/nest-cli.json`:

```json
{
  "collection": "@nestjs/schematics",
  "sourceRoot": "src"
}
```

- [ ] **Step 2: Create photo database schema**

Create `apps/photo-service/migrations/0001_create_photo_assets.sql`:

```sql
CREATE TABLE IF NOT EXISTS photo_assets (
  id uuid PRIMARY KEY,
  filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL,
  object_key text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('uploading', 'uploaded', 'processing', 'ready', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS photo_assets_created_at_idx ON photo_assets (created_at DESC);
CREATE INDEX IF NOT EXISTS photo_assets_status_idx ON photo_assets (status);
```

Create `apps/photo-service/src/db/schema.ts`:

```ts
import { bigint, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const photoAssets = pgTable(
  'photo_assets',
  {
    id: uuid('id').primaryKey(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'bigint' }).notNull(),
    objectKey: text('object_key').notNull().unique(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    createdAtIdx: index('photo_assets_created_at_idx').on(table.createdAt),
    statusIdx: index('photo_assets_status_idx').on(table.status)
  })
);
```

Create `apps/photo-service/src/photo/photo.types.ts`:

```ts
export type PhotoStatus = 'uploading' | 'uploaded' | 'processing' | 'ready' | 'failed';

export interface PhotoAssetRecord {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: bigint;
  objectKey: string;
  status: PhotoStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUploadIntentInput {
  filename: string;
  contentType: string;
  sizeBytes: bigint;
}
```

- [ ] **Step 3: Write failing unit tests for upload validation**

Create `apps/photo-service/src/photo/photo.service.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { PhotoDomainService } from './photo.service';

function createService() {
  const repository = {
    createUploading: vi.fn(),
    markUploaded: vi.fn(),
    findById: vi.fn(),
    list: vi.fn()
  };
  const storage = {
    createPresignedPutUrl: vi.fn(),
    objectExists: vi.fn()
  };
  return { service: new PhotoDomainService(repository, storage), repository, storage };
}

describe('PhotoDomainService', () => {
  it('rejects non-JPEG upload intents', async () => {
    const { service } = createService();

    await expect(
      service.createUploadIntent({ filename: 'notes.txt', contentType: 'text/plain', sizeBytes: 10n })
    ).rejects.toThrow('unsupported content type');
  });

  it('rejects files above 25 MB', async () => {
    const { service } = createService();

    await expect(
      service.createUploadIntent({ filename: 'large.jpg', contentType: 'image/jpeg', sizeBytes: 26n * 1024n * 1024n })
    ).rejects.toThrow('file too large');
  });

  it('creates an upload intent for a JPEG', async () => {
    const { service, repository, storage } = createService();
    repository.createUploading.mockResolvedValue({
      id: '018f0000-0000-7000-8000-000000000001',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 123n,
      objectKey: 'originals/018f0000-0000-7000-8000-000000000001/photo.jpg',
      status: 'uploading',
      createdAt: new Date('2026-06-21T00:00:00.000Z'),
      updatedAt: new Date('2026-06-21T00:00:00.000Z')
    });
    storage.createPresignedPutUrl.mockResolvedValue({
      uploadUrl: 'http://localhost:9000/photo-ops-originals/key?signature=test',
      expiresAt: new Date('2026-06-21T00:15:00.000Z')
    });

    const result = await service.createUploadIntent({ filename: 'photo.jpg', contentType: 'image/jpeg', sizeBytes: 123n });

    expect(result.photoId).toBe('018f0000-0000-7000-8000-000000000001');
    expect(result.uploadUrl).toContain('signature=test');
  });

  it('refuses to complete upload when object is missing', async () => {
    const { service, repository, storage } = createService();
    repository.findById.mockResolvedValue({
      id: '018f0000-0000-7000-8000-000000000001',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 123n,
      objectKey: 'originals/018f0000-0000-7000-8000-000000000001/photo.jpg',
      status: 'uploading',
      createdAt: new Date('2026-06-21T00:00:00.000Z'),
      updatedAt: new Date('2026-06-21T00:00:00.000Z')
    });
    repository.markUploaded.mockResolvedValue(undefined);
    storage.objectExists.mockResolvedValue(false);

    await expect(service.completeUpload('018f0000-0000-7000-8000-000000000001')).rejects.toThrow('uploaded object not found');
  });
});
```

- [ ] **Step 4: Run tests and verify failure**

Run: `pnpm --filter @photoops/photo-service test`

Expected: FAIL because `./photo.service` does not exist.

- [ ] **Step 5: Commit failing tests and schema**

```bash
git add apps/photo-service
git commit -m "test: define photo upload service behavior"
```

## Task 5: Photo Service Implementation

**Files:**

- Create: `apps/photo-service/src/photo/photo.service.ts`
- Create: `apps/photo-service/src/photo/photo.repository.ts`
- Create: `apps/photo-service/src/storage/minio.service.ts`
- Create: `apps/photo-service/src/db/client.ts`
- Create: `apps/photo-service/src/app.module.ts`
- Create: `apps/photo-service/src/main.ts`
- Create: `apps/photo-service/src/photo/photo.grpc.controller.ts`
- Create: `apps/photo-service/src/health/health.controller.ts`

- [ ] **Step 1: Implement domain service**

Create `apps/photo-service/src/photo/photo.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { CreateUploadIntentInput, PhotoAssetRecord } from './photo.types';

const MAX_UPLOAD_BYTES = 25n * 1024n * 1024n;
const JPEG_CONTENT_TYPES = new Set(['image/jpeg', 'image/jpg']);

export interface PhotoRepositoryPort {
  createUploading(input: CreateUploadIntentInput): Promise<PhotoAssetRecord>;
  markUploaded(photoId: string): Promise<PhotoAssetRecord>;
  findById(photoId: string): Promise<PhotoAssetRecord | null>;
  list(limit: number): Promise<PhotoAssetRecord[]>;
}

export interface ObjectStoragePort {
  createPresignedPutUrl(objectKey: string, contentType: string): Promise<{ uploadUrl: string; expiresAt: Date }>;
  objectExists(objectKey: string): Promise<boolean>;
}

@Injectable()
export class PhotoDomainService {
  constructor(
    private readonly repository: PhotoRepositoryPort,
    private readonly storage: ObjectStoragePort
  ) {}

  async createUploadIntent(input: CreateUploadIntentInput) {
    if (!JPEG_CONTENT_TYPES.has(input.contentType)) {
      throw new Error('unsupported content type');
    }
    if (input.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new Error('file too large');
    }

    const photo = await this.repository.createUploading(input);
    const presigned = await this.storage.createPresignedPutUrl(photo.objectKey, photo.contentType);

    return {
      photoId: photo.id,
      objectKey: photo.objectKey,
      uploadUrl: presigned.uploadUrl,
      expiresAt: presigned.expiresAt
    };
  }

  async completeUpload(photoId: string) {
    const photo = await this.repository.findById(photoId);
    if (!photo) {
      throw new Error('photo not found');
    }
    const objectExists = await this.storage.objectExists(photo.objectKey);
    if (!objectExists) {
      throw new Error('uploaded object not found');
    }
    return this.repository.markUploaded(photoId);
  }

  async listPhotos(limit = 100) {
    return this.repository.list(limit);
  }
}
```

- [ ] **Step 2: Run unit tests and verify pass**

Run: `pnpm --filter @photoops/photo-service test`

Expected: PASS for `PhotoDomainService` tests.

- [ ] **Step 3: Implement database client and repository**

Create `apps/photo-service/src/db/client.ts`:

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export function createDb() {
  const connectionString = process.env.PHOTO_DATABASE_URL;
  if (!connectionString) {
    throw new Error('PHOTO_DATABASE_URL is required');
  }
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}
```

Create `apps/photo-service/src/photo/photo.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { createDb } from '../db/client';
import { photoAssets } from '../db/schema';
import { CreateUploadIntentInput, PhotoAssetRecord } from './photo.types';
import { PhotoRepositoryPort } from './photo.service';

@Injectable()
export class PhotoRepository implements PhotoRepositoryPort {
  private readonly db = createDb();

  async createUploading(input: CreateUploadIntentInput): Promise<PhotoAssetRecord> {
    const id = uuidv7();
    const safeFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectKey = `originals/${id}/${safeFilename}`;
    const [created] = await this.db
      .insert(photoAssets)
      .values({
        id,
        filename: input.filename,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        objectKey,
        status: 'uploading'
      })
      .returning();
    return this.toRecord(created);
  }

  async markUploaded(photoId: string): Promise<PhotoAssetRecord> {
    const [updated] = await this.db
      .update(photoAssets)
      .set({ status: 'uploaded', updatedAt: new Date() })
      .where(eq(photoAssets.id, photoId))
      .returning();
    if (!updated) {
      throw new Error('photo not found');
    }
    return this.toRecord(updated);
  }

  async findById(photoId: string): Promise<PhotoAssetRecord | null> {
    const [row] = await this.db.select().from(photoAssets).where(eq(photoAssets.id, photoId)).limit(1);
    return row ? this.toRecord(row) : null;
  }

  async list(limit: number): Promise<PhotoAssetRecord[]> {
    const rows = await this.db.select().from(photoAssets).orderBy(desc(photoAssets.createdAt)).limit(limit);
    return rows.map((row) => this.toRecord(row));
  }

  private toRecord(row: typeof photoAssets.$inferSelect): PhotoAssetRecord {
    return {
      id: row.id,
      filename: row.filename,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      objectKey: row.objectKey,
      status: row.status as PhotoAssetRecord['status'],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}
```

- [ ] **Step 4: Implement MinIO service**

Create `apps/photo-service/src/storage/minio.service.ts`:

```ts
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ObjectStoragePort } from '../photo/photo.service';

@Injectable()
export class MinioStorageService implements ObjectStoragePort {
  private readonly bucket = process.env.MINIO_BUCKET ?? 'photo-ops-originals';
  private readonly client = new S3Client({
    region: 'us-east-1',
    endpoint: process.env.MINIO_ENDPOINT ?? 'http://minio:9000',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ROOT_USER ?? 'minioadmin',
      secretAccessKey: process.env.MINIO_ROOT_PASSWORD ?? 'minioadmin'
    }
  });

  async createPresignedPutUrl(objectKey: string, contentType: string) {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: objectKey, ContentType: contentType });
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: 900 });
    return { uploadUrl, expiresAt: new Date(Date.now() + 900_000) };
  }

  async objectExists(objectKey: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }));
      return true;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 5: Implement gRPC controller and app module**

Create `apps/photo-service/src/photo/photo.grpc.controller.ts`:

```ts
import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PhotoDomainService } from './photo.service';

@Controller()
export class PhotoGrpcController {
  constructor(private readonly photoService: PhotoDomainService) {}

  @GrpcMethod('PhotoService', 'Health')
  health() {
    return { status: 'ok', service: 'photo-service' };
  }

  @GrpcMethod('PhotoService', 'CreateUploadIntent')
  async createUploadIntent(request: { filename: string; contentType: string; sizeBytes: string }) {
    const result = await this.photoService.createUploadIntent({
      filename: request.filename,
      contentType: request.contentType,
      sizeBytes: BigInt(request.sizeBytes)
    });
    return {
      photoId: result.photoId,
      objectKey: result.objectKey,
      uploadUrl: result.uploadUrl,
      expiresAt: result.expiresAt.toISOString()
    };
  }

  @GrpcMethod('PhotoService', 'CompleteUpload')
  async completeUpload(request: { photoId: string }) {
    return this.mapPhoto(await this.photoService.completeUpload(request.photoId));
  }

  @GrpcMethod('PhotoService', 'ListPhotos')
  async listPhotos(request: { pageSize?: number }) {
    const photos = await this.photoService.listPhotos(request.pageSize || 100);
    return { photos: photos.map((photo) => this.mapPhoto(photo)), nextPageToken: '' };
  }

  private mapPhoto(photo: Awaited<ReturnType<PhotoDomainService['listPhotos']>>[number]) {
    const statusMap = {
      uploading: 1,
      uploaded: 2,
      processing: 3,
      ready: 4,
      failed: 5
    } as const;
    return {
      id: photo.id,
      filename: photo.filename,
      contentType: photo.contentType,
      sizeBytes: photo.sizeBytes.toString(),
      objectKey: photo.objectKey,
      status: statusMap[photo.status],
      createdAt: photo.createdAt.toISOString(),
      updatedAt: photo.updatedAt.toISOString()
    };
  }
}
```

Create `apps/photo-service/src/health/health.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return { status: 'ok', service: 'photo-service' };
  }
}
```

Create `apps/photo-service/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { PhotoGrpcController } from './photo/photo.grpc.controller';
import { PhotoRepository } from './photo/photo.repository';
import { PhotoDomainService } from './photo/photo.service';
import { MinioStorageService } from './storage/minio.service';

@Module({
  controllers: [HealthController, PhotoGrpcController],
  providers: [
    PhotoRepository,
    MinioStorageService,
    {
      provide: PhotoDomainService,
      useFactory: (repository: PhotoRepository, storage: MinioStorageService) => new PhotoDomainService(repository, storage),
      inject: [PhotoRepository, MinioStorageService]
    }
  ]
})
export class AppModule {}
```

Create `apps/photo-service/src/main.ts`:

```ts
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'photoops.photo.v1',
      protoPath: join(process.cwd(), '../../proto/photo/v1/photo_service.proto'),
      url: `0.0.0.0:${process.env.PHOTO_SERVICE_GRPC_PORT ?? '50051'}`
    }
  });
  await app.startAllMicroservices();
  await app.listen(3002);
}

void bootstrap();
```

- [ ] **Step 6: Verify service keeps domain constructor testable**

Run: `grep -R "@Inject('PhotoRepositoryPort')\|@Inject('ObjectStoragePort')" apps/photo-service/src/photo/photo.service.ts || true`

Expected: command exits with status `0` and prints no matches. `PhotoDomainService` must remain constructible as `new PhotoDomainService(repository, storage)` in unit tests.

- [ ] **Step 7: Run service tests and build**

Run: `pnpm --filter @photoops/photo-service test && pnpm --filter @photoops/photo-service build`

Expected: both commands exit with status `0`.

- [ ] **Step 8: Commit photo-service implementation**

```bash
git add apps/photo-service
git commit -m "feat: implement photo upload service"
```

## Task 6: API Gateway HTTP Facade

**Files:**

- Create: `apps/api-gateway/package.json`
- Create: `apps/api-gateway/tsconfig.json`
- Create: `apps/api-gateway/nest-cli.json`
- Create: `apps/api-gateway/src/main.ts`
- Create: `apps/api-gateway/src/app.module.ts`
- Create: `apps/api-gateway/src/http/health.controller.ts`
- Create: `apps/api-gateway/src/http/photo.controller.ts`
- Create: `apps/api-gateway/src/grpc/photo.client.ts`
- Create: `apps/api-gateway/src/errors/http-error.filter.ts`

- [ ] **Step 1: Write failing controller tests**

Create `apps/api-gateway/package.json`:

```json
{
  "name": "@photoops/api-gateway",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "test": "vitest run",
    "lint": "eslint src --ext .ts"
  },
  "dependencies": {
    "@grpc/grpc-js": "^1.12.6",
    "@nestjs/common": "^10.4.15",
    "@nestjs/core": "^10.4.15",
    "@nestjs/microservices": "^10.4.15",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.8",
    "@types/node": "^22.10.5",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

Create `apps/api-gateway/tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "target": "ES2022",
    "outDir": "./dist",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

Create `apps/api-gateway/nest-cli.json`:

```json
{
  "collection": "@nestjs/schematics",
  "sourceRoot": "src"
}
```

- [ ] **Step 2: Implement HTTP facade**

Create `apps/api-gateway/src/grpc/photo.client.ts`:

```ts
import { credentials, loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { Injectable } from '@nestjs/common';
import { join } from 'node:path';

export interface PhotoGatewayClient {
  createUploadIntent(input: { filename: string; contentType: string; sizeBytes: string }): Promise<unknown>;
  completeUpload(input: { photoId: string }): Promise<unknown>;
  listPhotos(input: { pageSize: number }): Promise<unknown>;
}

type Callback<T> = (error: Error | null, value: T) => void;

interface GrpcPhotoServiceClient {
  CreateUploadIntent(input: { filename: string; contentType: string; sizeBytes: string }, callback: Callback<unknown>): void;
  CompleteUpload(input: { photoId: string }, callback: Callback<unknown>): void;
  ListPhotos(input: { pageSize: number }, callback: Callback<unknown>): void;
}

@Injectable()
export class PhotoClient implements PhotoGatewayClient {
  private readonly client: GrpcPhotoServiceClient;

  constructor() {
    const protoPath = join(process.cwd(), '../../proto/photo/v1/photo_service.proto');
    const packageDefinition = loadSync(protoPath, {
      keepCase: false,
      longs: String,
      enums: Number,
      defaults: true,
      oneofs: true,
      includeDirs: [join(process.cwd(), '../../proto')]
    });
    const loaded = loadPackageDefinition(packageDefinition) as unknown as {
      photoops: { photo: { v1: { PhotoService: new (target: string, credentials: ReturnType<typeof credentials.createInsecure>) => GrpcPhotoServiceClient } } };
    };
    const target = process.env.PHOTO_SERVICE_GRPC_URL ?? 'photo-service:50051';
    this.client = new loaded.photoops.photo.v1.PhotoService(target, credentials.createInsecure());
  }

  async createUploadIntent(input: { filename: string; contentType: string; sizeBytes: string }) {
    return this.call((callback) => this.client.CreateUploadIntent(input, callback));
  }

  async completeUpload(input: { photoId: string }) {
    return this.call((callback) => this.client.CompleteUpload(input, callback));
  }

  async listPhotos(input: { pageSize: number }) {
    return this.call((callback) => this.client.ListPhotos(input, callback));
  }

  private call<T>(invoke: (callback: Callback<T>) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      invoke((error, value) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(value);
      });
    });
  }
}
```

Create `apps/api-gateway/src/http/photo.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PhotoClient } from '../grpc/photo.client';

@Controller('photos')
export class PhotoController {
  constructor(private readonly photoClient: PhotoClient) {}

  @Post('upload-intents')
  createUploadIntent(@Body() body: { filename: string; contentType: string; sizeBytes: string }) {
    return this.photoClient.createUploadIntent(body);
  }

  @Post(':photoId/complete-upload')
  completeUpload(@Param('photoId') photoId: string) {
    return this.photoClient.completeUpload({ photoId });
  }

  @Get()
  listPhotos() {
    return this.photoClient.listPhotos({ pageSize: 100 });
  }
}
```

Create `apps/api-gateway/src/http/health.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return { status: 'ok', service: 'api-gateway' };
  }
}
```

Create `apps/api-gateway/src/errors/http-error.filter.ts`:

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const message = exception instanceof Error ? exception.message : 'internal error';
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ code: 'internal_error', message });
  }
}
```

Create `apps/api-gateway/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PhotoClient } from './grpc/photo.client';
import { HealthController } from './http/health.controller';
import { PhotoController } from './http/photo.controller';

@Module({
  controllers: [HealthController, PhotoController],
  providers: [PhotoClient]
})
export class AppModule {}
```

Create `apps/api-gateway/src/main.ts`:

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpErrorFilter } from './errors/http-error.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  app.useGlobalFilters(new HttpErrorFilter());
  await app.listen(process.env.API_GATEWAY_PORT ?? 3001);
}

void bootstrap();
```

- [ ] **Step 3: Verify gateway does not own data**

Run: `grep -R "DATABASE_URL\|PHOTO_DATABASE_URL\|CLUSTER_DATABASE_URL\|PUBLICATION_DATABASE_URL\|USAGE_DATABASE_URL\|CONNECTOR_DATABASE_URL" apps/api-gateway || true`

Expected: command exits with status `0` and prints no matches.

- [ ] **Step 4: Build gateway**

Run: `pnpm --filter @photoops/api-gateway build`

Expected: command exits with status `0`.

- [ ] **Step 5: Commit gateway**

```bash
git add apps/api-gateway
git commit -m "feat: add api gateway photo facade"
```

## Task 7: Web Upload/List UI

**Files:**

- Create: `apps/web/package.json`
- Create: `apps/web/next.config.js`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/globals.css`
- Create: `apps/web/lib/api.ts`
- Create: `apps/web/app/page.tsx`

- [ ] **Step 1: Create web package**

Create `apps/web/package.json`:

```json
{
  "name": "@photoops/web",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "test": "vitest run",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^15.1.4",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.5",
    "@types/react": "^19.0.4",
    "@types/react-dom": "^19.0.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

Create `apps/web/next.config.js`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = nextConfig;
```

Create `apps/web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 2: Create browser API helper**

Create `apps/web/lib/api.ts`:

```ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export interface PhotoAsset {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: string;
  objectKey: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export async function createUploadIntent(file: File) {
  const response = await fetch(`${API_BASE_URL}/photos/upload-intents`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: file.type, sizeBytes: String(file.size) })
  });
  if (!response.ok) {
    throw new Error(`CreateUploadIntent failed: ${response.status}`);
  }
  return response.json() as Promise<{ photoId: string; uploadUrl: string }>;
}

export async function completeUpload(photoId: string) {
  const response = await fetch(`${API_BASE_URL}/photos/${photoId}/complete-upload`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`CompleteUpload failed: ${response.status}`);
  }
  return response.json() as Promise<PhotoAsset>;
}

export async function listPhotos() {
  const response = await fetch(`${API_BASE_URL}/photos`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`ListPhotos failed: ${response.status}`);
  }
  const body = await response.json();
  return (body.photos ?? []) as PhotoAsset[];
}

export async function uploadFileToPresignedUrl(uploadUrl: string, file: File) {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': file.type },
    body: file
  });
  if (!response.ok) {
    throw new Error(`MinIO upload failed: ${response.status}`);
  }
}
```

- [ ] **Step 3: Create upload page**

Create `apps/web/app/layout.tsx`:

```tsx
import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'PhotoOps',
  description: 'Architecture frame upload slice'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Create `apps/web/app/globals.css`:

```css
body {
  margin: 0;
  font-family: Arial, sans-serif;
  background: #101319;
  color: #f4f7fb;
}

main {
  max-width: 880px;
  margin: 0 auto;
  padding: 48px 24px;
}

button,
input {
  font: inherit;
}

.panel {
  border: 1px solid #2a3140;
  background: #171b24;
  border-radius: 16px;
  padding: 24px;
}
```

Create `apps/web/app/page.tsx`:

```tsx
'use client';

import { FormEvent, useEffect, useState } from 'react';
import { completeUpload, createUploadIntent, listPhotos, PhotoAsset, uploadFileToPresignedUrl } from '../lib/api';

export default function HomePage() {
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [message, setMessage] = useState('Ready');

  async function refreshPhotos() {
    setPhotos(await listPhotos());
  }

  useEffect(() => {
    void refreshPhotos().catch((error) => setMessage(error instanceof Error ? error.message : 'Failed to load photos'));
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem('photo') as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      setMessage('Choose a JPEG file first');
      return;
    }
    setMessage('Creating upload intent');
    const intent = await createUploadIntent(file);
    setMessage('Uploading to object storage');
    await uploadFileToPresignedUrl(intent.uploadUrl, file);
    setMessage('Completing upload');
    await completeUpload(intent.photoId);
    await refreshPhotos();
    form.reset();
    setMessage('Upload complete');
  }

  return (
    <main>
      <h1>PhotoOps Architecture Frame</h1>
      <p>This is the first executable frame, not the full MVP. It ends with upload/list.</p>
      <section className="panel">
        <h2>Upload JPEG</h2>
        <form onSubmit={(event) => void onSubmit(event)}>
          <input name="photo" type="file" accept="image/jpeg" />
          <button type="submit">Upload</button>
        </form>
        <p>{message}</p>
      </section>
      <section>
        <h2>Uploaded Photos</h2>
        {photos.length === 0 ? <p>No photos uploaded yet.</p> : null}
        <ul>
          {photos.map((photo) => (
            <li key={photo.id}>{photo.filename} - {photo.status}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Build web**

Run: `pnpm --filter @photoops/web build`

Expected: command exits with status `0`.

- [ ] **Step 5: Commit web UI**

```bash
git add apps/web
git commit -m "feat: add upload list web UI"
```

## Task 8: Service Scaffolds For Remaining Runtime

**Files:**

- Create: `apps/media-worker/pyproject.toml`
- Create: `apps/media-worker/src/main.py`
- Create: `apps/cluster-service/go.mod`
- Create: `apps/cluster-service/cmd/server/main.go`
- Create: `apps/publication-service/package.json`
- Create: `apps/publication-service/src/main.ts`
- Create: `apps/usage-service/package.json`
- Create: `apps/usage-service/src/main.ts`
- Create: `apps/connector-service/package.json`
- Create: `apps/connector-service/src/main.ts`

- [ ] **Step 1: Create media-worker scaffold**

Create `apps/media-worker/pyproject.toml`:

```toml
[project]
name = "photoops-media-worker"
version = "0.0.0"
requires-python = ">=3.12"

[tool.pytest.ini_options]
testpaths = ["tests"]
```

Create `apps/media-worker/src/main.py`:

```python
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok","service":"media-worker"}')
            return
        self.send_response(501)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"code":"not_implemented","message":"media processing is not implemented in this frame"}')


if __name__ == "__main__":
    HTTPServer(("0.0.0.0", 3010), Handler).serve_forever()
```

- [ ] **Step 2: Create cluster-service scaffold**

Create `apps/cluster-service/go.mod`:

```go
module github.com/photoops/cluster-service

go 1.23
```

Create `apps/cluster-service/cmd/server/main.go`:

```go
package main

import (
  "encoding/json"
  "log"
  "net/http"
)

func main() {
  http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("content-type", "application/json")
    json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": "cluster-service"})
  })
  http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("content-type", "application/json")
    w.WriteHeader(http.StatusNotImplemented)
    json.NewEncoder(w).Encode(map[string]string{"code": "not_implemented", "message": "clustering is not implemented in this frame"})
  })
  log.Fatal(http.ListenAndServe(":3011", nil))
}
```

- [ ] **Step 3: Create TypeScript domain scaffolds**

Create `apps/publication-service/package.json`:

```json
{"name":"@photoops/publication-service","private":true,"scripts":{"build":"tsc -p tsconfig.json","test":"node -e \"process.exit(0)\"","lint":"node -e \"process.exit(0)\""},"dependencies":{"typescript":"^5.7.2"},"devDependencies":{}}
```

Create `apps/publication-service/tsconfig.json`:

```json
{"compilerOptions":{"target":"ES2022","module":"commonjs","outDir":"dist","strict":true},"include":["src/**/*.ts"]}
```

Create `apps/publication-service/src/main.ts`:

```ts
import { createServer } from 'node:http';

createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.url === '/health') {
    res.end(JSON.stringify({ status: 'ok', service: 'publication-service' }));
    return;
  }
  res.statusCode = 501;
  res.end(JSON.stringify({ code: 'not_implemented', message: 'publication is not implemented in this frame' }));
}).listen(3012);
```

Create `apps/usage-service/package.json`:

```json
{"name":"@photoops/usage-service","private":true,"scripts":{"build":"tsc -p tsconfig.json","test":"node -e \"process.exit(0)\"","lint":"node -e \"process.exit(0)\""},"dependencies":{"typescript":"^5.7.2"},"devDependencies":{}}
```

Create `apps/usage-service/tsconfig.json`:

```json
{"compilerOptions":{"target":"ES2022","module":"commonjs","outDir":"dist","strict":true},"include":["src/**/*.ts"]}
```

Create `apps/usage-service/src/main.ts`:

```ts
import { createServer } from 'node:http';

createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.url === '/health') {
    res.end(JSON.stringify({ status: 'ok', service: 'usage-service' }));
    return;
  }
  res.statusCode = 501;
  res.end(JSON.stringify({ code: 'not_implemented', message: 'usage accounting is not implemented in this frame' }));
}).listen(3013);
```

Create `apps/connector-service/package.json`:

```json
{"name":"@photoops/connector-service","private":true,"scripts":{"build":"tsc -p tsconfig.json","test":"node -e \"process.exit(0)\"","lint":"node -e \"process.exit(0)\""},"dependencies":{"typescript":"^5.7.2"},"devDependencies":{}}
```

Create `apps/connector-service/tsconfig.json`:

```json
{"compilerOptions":{"target":"ES2022","module":"commonjs","outDir":"dist","strict":true},"include":["src/**/*.ts"]}
```

Create `apps/connector-service/src/main.ts`:

```ts
import { createServer } from 'node:http';

createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.url === '/health') {
    res.end(JSON.stringify({ status: 'ok', service: 'connector-service' }));
    return;
  }
  res.statusCode = 501;
  res.end(JSON.stringify({ code: 'not_implemented', message: 'connectors are not implemented in this frame' }));
}).listen(3014);
```

- [ ] **Step 4: Build scaffolds**

Run: `pnpm --filter @photoops/publication-service build && pnpm --filter @photoops/usage-service build && pnpm --filter @photoops/connector-service build && (cd apps/cluster-service && go test ./...)`

Expected: command exits with status `0`.

- [ ] **Step 5: Commit service scaffolds**

```bash
git add apps/media-worker apps/cluster-service apps/publication-service apps/usage-service apps/connector-service
git commit -m "chore: scaffold remaining services"
```

## Task 9: Compose Application Services

**Files:**

- Modify: `infra/docker/docker-compose.yml`
- Create: `apps/web/Dockerfile`
- Create: `apps/api-gateway/Dockerfile`
- Create: `apps/photo-service/Dockerfile`
- Create: `apps/media-worker/Dockerfile`
- Create: `apps/cluster-service/Dockerfile`
- Create: `apps/publication-service/Dockerfile`
- Create: `apps/usage-service/Dockerfile`
- Create: `apps/connector-service/Dockerfile`

- [ ] **Step 1: Add Dockerfiles for Node services**

Create `apps/api-gateway/Dockerfile`:

```dockerfile
FROM node:22-alpine
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api-gateway/package.json apps/api-gateway/package.json
COPY packages/proto-ts/package.json packages/proto-ts/package.json
RUN corepack enable && pnpm install --filter @photoops/api-gateway --prod=false
COPY . .
RUN pnpm --filter @photoops/api-gateway build
CMD ["pnpm", "--filter", "@photoops/api-gateway", "start"]
```

Create `apps/photo-service/Dockerfile` with the same pattern and replace package name with `@photoops/photo-service`.

Create `apps/web/Dockerfile` with the same pattern and replace package name with `@photoops/web`.

- [ ] **Step 2: Add Dockerfiles for Python and Go services**

Create `apps/media-worker/Dockerfile`:

```dockerfile
FROM python:3.12-alpine
WORKDIR /app
COPY apps/media-worker /app
CMD ["python", "src/main.py"]
```

Create `apps/cluster-service/Dockerfile`:

```dockerfile
FROM golang:1.23-alpine AS build
WORKDIR /src
COPY apps/cluster-service .
RUN go build -o /bin/cluster-service ./cmd/server

FROM alpine:3.21
COPY --from=build /bin/cluster-service /bin/cluster-service
CMD ["/bin/cluster-service"]
```

Create TypeScript service Dockerfiles for `publication-service`, `usage-service`, and `connector-service` using the same Node pattern as `api-gateway` with their package names.

- [ ] **Step 3: Extend Compose with application services**

Modify `infra/docker/docker-compose.yml` to add:

```yaml
  photo-service:
    build:
      context: ../..
      dockerfile: apps/photo-service/Dockerfile
    environment:
      PHOTO_DATABASE_URL: ${PHOTO_DATABASE_URL}
      PHOTO_SERVICE_GRPC_PORT: ${PHOTO_SERVICE_GRPC_PORT}
      MINIO_ENDPOINT: ${MINIO_ENDPOINT}
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
      MINIO_BUCKET: ${MINIO_BUCKET}
      RABBITMQ_URL: ${RABBITMQ_URL}
    depends_on:
      postgres:
        condition: service_healthy
      minio-init:
        condition: service_completed_successfully
      rabbitmq:
        condition: service_healthy
    ports:
      - "3002:3002"
      - "50051:50051"

  api-gateway:
    build:
      context: ../..
      dockerfile: apps/api-gateway/Dockerfile
    environment:
      API_GATEWAY_PORT: ${API_GATEWAY_PORT}
      PHOTO_SERVICE_GRPC_URL: photo-service:${PHOTO_SERVICE_GRPC_PORT}
    depends_on:
      - photo-service
    ports:
      - "3001:3001"

  web:
    build:
      context: ../..
      dockerfile: apps/web/Dockerfile
    environment:
      NEXT_PUBLIC_API_BASE_URL: ${NEXT_PUBLIC_API_BASE_URL}
    depends_on:
      - api-gateway
    ports:
      - "3000:3000"
```

Also add `media-worker`, `cluster-service`, `publication-service`, `usage-service`, and `connector-service` with their Dockerfiles and ports `3010` through `3014`.

- [ ] **Step 4: Verify compose build**

Run: `docker compose -f infra/docker/docker-compose.yml --env-file .env build`

Expected: command exits with status `0`.

- [ ] **Step 5: Commit compose application services**

```bash
git add infra/docker/docker-compose.yml apps/*/Dockerfile
git commit -m "chore: run services in compose"
```

## Task 10: End-To-End Verification And Documentation

**Files:**

- Modify: `README.md`
- Create: `docs/architecture-frame-verification.md`
- Create: `scripts/smoke-upload.sh`

- [ ] **Step 1: Apply photo database migration**

Run: `make migrate-photo`

Expected: output includes `CREATE TABLE` or `CREATE INDEX`, or notices that objects already exist.

- [ ] **Step 2: Start all services**

Run: `make dev`

Expected: all services start and remain running.

- [ ] **Step 3: Verify health endpoints**

Run these commands:

```bash
curl -fsS http://localhost:3001/health
curl -fsS http://localhost:3002/health
curl -fsS http://localhost:3010/health
curl -fsS http://localhost:3011/health
curl -fsS http://localhost:3012/health
curl -fsS http://localhost:3013/health
curl -fsS http://localhost:3014/health
```

Expected: each command returns JSON with `"status":"ok"`.

- [ ] **Step 4: Create smoke upload script**

Create `scripts/smoke-upload.sh`:

```sh
#!/usr/bin/env sh
set -eu

API_BASE_URL="${API_BASE_URL:-http://localhost:3001}"
TMP_DIR="${TMPDIR:-/tmp}/photoops-smoke"
JPEG_PATH="$TMP_DIR/smoke.jpg"
INTENT_PATH="$TMP_DIR/intent.json"
COMPLETE_PATH="$TMP_DIR/complete.json"
LIST_PATH="$TMP_DIR/list.json"

mkdir -p "$TMP_DIR"

python3 - <<'PY' "$JPEG_PATH"
from pathlib import Path
import base64
import sys

Path(sys.argv[1]).write_bytes(base64.b64decode(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z"
))
PY

curl -fsS \
  -H 'content-type: application/json' \
  -d "{\"filename\":\"smoke.jpg\",\"contentType\":\"image/jpeg\",\"sizeBytes\":\"$(wc -c < "$JPEG_PATH" | tr -d ' ')\"}" \
  "$API_BASE_URL/photos/upload-intents" > "$INTENT_PATH"

PHOTO_ID="$(python3 - <<'PY' "$INTENT_PATH"
import json, sys
print(json.load(open(sys.argv[1]))["photoId"])
PY
)"

UPLOAD_URL="$(python3 - <<'PY' "$INTENT_PATH"
import json, sys
print(json.load(open(sys.argv[1]))["uploadUrl"])
PY
)"

curl -fsS -X PUT -H 'content-type: image/jpeg' --data-binary "@$JPEG_PATH" "$UPLOAD_URL" >/dev/null
curl -fsS -X POST "$API_BASE_URL/photos/$PHOTO_ID/complete-upload" > "$COMPLETE_PATH"
curl -fsS "$API_BASE_URL/photos" > "$LIST_PATH"

python3 - <<'PY' "$PHOTO_ID" "$LIST_PATH"
import json, sys
photo_id = sys.argv[1]
photos = json.load(open(sys.argv[2])).get("photos", [])
if not any(photo.get("id") == photo_id and str(photo.get("status")).lower().endswith("uploaded") for photo in photos):
    raise SystemExit("uploaded smoke photo not found in list response")
print("smoke upload ok")
PY
```

Run: `chmod +x scripts/smoke-upload.sh`

Expected: command exits with status `0`.

- [ ] **Step 5: Verify upload/list with smoke script**

Run: `make smoke-upload`

Expected: output includes `smoke upload ok`.

- [ ] **Step 6: Verify upload/list manually**

Run: open `http://localhost:3000`, upload a JPEG smaller than 25 MB, and confirm it appears in the Uploaded Photos list with status `uploaded`.

Expected: the UI shows `Upload complete`, then the uploaded filename appears in the list.

- [ ] **Step 7: Verify unsupported file error manually**

Run: upload a `.txt` file through the UI.

Expected: the UI shows an error from `CreateUploadIntent` and no object is listed.

- [ ] **Step 8: Document verification**

Create `docs/architecture-frame-verification.md`:

```markdown
# Architecture Frame Verification

## Verified Scenario

The first executable frame ends with upload/list, not the full MVP.

Verified path:

```text
web -> api-gateway -> photo-service -> MinIO + photo-db -> web
```

## Commands

```bash
cp .env.example .env
make install
make proto
docker compose -f infra/docker/docker-compose.yml --env-file .env build
make dev
make migrate-photo
make smoke-upload
```

## Automated Smoke Check

`scripts/smoke-upload.sh` creates an upload intent, uploads a tiny JPEG through the presigned URL, completes the upload, lists photos, and verifies the uploaded photo is present with status `uploaded`.

## Manual Check

1. Open `http://localhost:3000`.
2. Upload a JPEG smaller than 25 MB.
3. Confirm the file appears in the uploaded photos list with status `uploaded`.

## Known Limits

- EXIF extraction is not implemented in this frame.
- Preview generation is not implemented in this frame.
- Clustering is not implemented in this frame.
- Publication is not implemented in this frame.
```

- [ ] **Step 9: Update README verification section**

Append to `README.md`:

```markdown
## Verification

See `docs/architecture-frame-verification.md` for the commands and manual checks used to verify the first executable frame.
```

- [ ] **Step 10: Run final verification**

Run:

```bash
pnpm proto
pnpm build
pnpm test
docker compose -f infra/docker/docker-compose.yml --env-file .env build
make smoke-upload
```

Expected: all commands exit with status `0`.

- [ ] **Step 11: Commit verification docs and smoke script**

```bash
git add README.md docs/architecture-frame-verification.md scripts/smoke-upload.sh
git commit -m "docs: document architecture frame verification"
```

## Self-Review Checklist

- Spec coverage: the plan covers project frame, DB-per-service setup, proto contracts, upload/list first executable slice, service health, explicit unimplemented service behavior, documentation, and verification.
- Scope boundary: the plan explicitly excludes full MVP features and keeps the first frame ending at upload/list.
- Data ownership: only `photo-service` connects to `PHOTO_DATABASE_URL`; gateway and web do not own data.
- Contract boundary: browser uses HTTP through `api-gateway`; gateway talks to `photo-service`; presigned MinIO PUT is the only direct browser-to-infrastructure path.
- Verification: every major task has an explicit command and expected result.
