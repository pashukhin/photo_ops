# Media-Processing Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the first async media-processing workflow end to end — `CompleteUpload` publishes a job, the Python `media-worker` generates thumbnail/preview variants + extracts EXIF/GPS, reports back over a queue, and `photo-service` writes variants/attributes and moves the asset `uploaded → processing → ready | failed` — plus the owner-scoped delivery API the gallery UI (session 009) will consume.

**Architecture:** Async over RabbitMQ behind a broker-agnostic transport port (proto-defined payloads). Only `photo-service` writes `photo-db`; the worker reports results over a result queue. Idempotency is by a `processing_jobs` run record (charge-once by `job_id`), `(photo_id, variant_type)` variant upserts, and a worker claim via MinIO object metadata.

**Tech Stack:** TypeScript/NestJS + Drizzle + Vitest (`photo-service`, `api-gateway`); Python 3.12 + Pillow + pika + pytest (`media-worker`); RabbitMQ; MinIO (S3); Postgres; buf/proto-ts + buf Python codegen.

**Spec:** `docs/superpowers/specs/2026-06-24-photoops-media-processing-backend-design.md` — read it before starting; this plan implements it section-for-section.

## Global Constraints

- **DB ownership:** only `photo-service` writes `photo-db`. The worker never connects to Postgres; it talks MinIO + the broker only.
- **Broker-agnostic:** business code depends on a transport **port** (`publish`/`consume`), never on `pika`/`amqplib` directly. Exchanges/queues/routing/DLX are adapter config, not in the port signature.
- **Message schema = proto:** job/result payloads are proto messages serialized into the AMQP body (TS via `@photoops/proto-ts` codecs, Python via generated `_pb2`).
- **Idempotency:** finalize is idempotent by `job_id`; variants upsert on `(photo_id, variant_type)` with deterministic key `variants/{photo_id}/{variant_type}.jpg`; worker claims via `x-amz-meta-job-id`.
- **Privacy (NFR 4.4):** originals stay private; variants strip EXIF; only owner-scoped presigned GET URLs are returned.
- **Reliability (NFR 4.3):** one photo's failure fails only its job (`failed`); reprocessing/redelivery never duplicates variants or double-bills.
- **Deferred (do NOT build):** reverse geocoding/`Location`/`location_id`; query sort/filter/pagination params; the `publish` variant; usage-event emission/`BillingEvent`; user-initiated reprocess flow; multi-format input; multi-target renditions. Build only the `initial` path and the named seams.
- **Test conventions:** Vitest co-located `*.spec.ts`, domain logic tested against mocked ports (`vi.fn()`); repositories/SQL covered by the local integration test, not CI. Python: pytest under `apps/media-worker/tests/`. Pure logic is unit-tested with fakes; real broker/MinIO only in the local integration task.
- **Gate:** `make gate` (= `proto-check typecheck lint build test`) must pass before any push. Python tests are added to a new `make test-media-worker` target and a CI job in this work.
- **Commits:** every commit ends with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer. Each beads issue is claimed before its task and closed after.
- **Infra/host problems:** do NOT self-fix broker/Docker/host issues — diagnose, propose, and escalate to the user.

---

## File Structure

New and modified files, grouped by responsibility.

**proto (contracts):**
- Create `proto/photo/v1/processing.proto` — async job/result messages (`ProcessPhotoJob`, `PhotoProcessingResult`, `ImageAttributes`, `VariantResult`, enums).
- Modify `proto/photo/v1/photo_service.proto` — extend `PhotoAsset` with attribute + variant-view fields; add `GetPhoto` RPC.
- Modify `proto/buf.gen.yaml` — add Python codegen plugin.
- Generated: `packages/proto-ts/src/photo/v1/*` (TS, regenerated); `apps/media-worker/src/photoops_proto/**` (Python `_pb2`, new).

**photo-service (TS) — producer, finalize, data, delivery:**
- Modify `src/db/schema.ts`; create `migrations/0002_media_processing.sql`.
- Modify `src/photo/photo.types.ts` (record types).
- Modify `src/photo/photo.repository.ts` (job/variant/attribute/finalize/detail queries).
- Create `src/messaging/messaging.port.ts`, `src/messaging/in-memory-bus.ts`, `src/messaging/rabbitmq-bus.ts`.
- Modify `src/photo/photo.service.ts` (publish on complete; finalize result; detail/list mapping).
- Create `src/photo/processing.consumer.ts` (result-queue consumer → domain).
- Modify `src/storage/minio.service.ts` (`createPresignedGetUrl`).
- Modify `src/photo/photo.grpc.controller.ts` (`GetPhoto`; extended mapping).
- Modify `src/app.module.ts`, `src/main.ts` (DI + consumer bootstrap).

**media-worker (Python) — processing:**
- Modify `pyproject.toml`, `Dockerfile`.
- Create `src/media_worker/config.py`, `storage.py`, `imaging.py`, `exif.py`, `messaging/port.py`, `messaging/in_memory.py`, `messaging/rabbitmq.py`, `handler.py`, `app.py`; modify `src/main.py`.
- Create `tests/` with focused test modules.

**api-gateway (TS) — BFF:**
- Modify `src/http/photo.controller.ts` (`GET /photos/:id`), `src/grpc/photo.client.ts` (GetPhoto), mapping.

**infra / tooling:**
- Modify `infra/docker/docker-compose.yml` (media-worker env + depends_on).
- Modify `Makefile` (`migrate-photo` adds 0002; `test-media-worker`, `lint-media-worker`); `.github/workflows/ci.yml` (Python job).
- Create `scripts/smoke-media-processing.sh` (local integration).

---

## Phase 0 — Contracts, messaging port, Python toolchain

### Task 0.1: Async message proto contract

**Files:**
- Create: `proto/photo/v1/processing.proto`
- Test: proto compiles + TS regenerates cleanly (no hand test; `make proto` is the check)

**Interfaces:**
- Produces (proto package `photoops.photo.v1`): messages `ProcessPhotoJob{job_id,photo_id,user_id,object_key,type,correlation_id}`, `PhotoProcessingResult{job_id,photo_id,correlation_id,outcome,error_message,attributes,variants[],metadata_json}`, `ImageAttributes{width,height,taken_at_local,taken_at_utc,taken_at_tz_source,camera_make,camera_model,orientation,lat?,lon?}`, `VariantResult{variant_type,object_key,width,height,size_bytes,content_type}`, enums `ProcessingType{UNSPECIFIED,INITIAL,REPROCESS}`, `ProcessingOutcome{UNSPECIFIED,SUCCEEDED,FAILED}`.

- [ ] **Step 1: Write the proto** — create `proto/photo/v1/processing.proto` with `syntax = "proto3"; package photoops.photo.v1;` and the messages/enums exactly as in the spec "Message Contracts (proto)" section (use `optional double lat = 9; optional double lon = 10;`).
- [ ] **Step 2: Regenerate + verify it builds**

Run: `make proto`
Expected: new `packages/proto-ts/src/photo/v1/processing.ts` appears with `ProcessPhotoJob`, `PhotoProcessingResult`, etc. and exported `*Fns` codecs; no buf lint errors.

- [ ] **Step 3: Confirm no drift**

Run: `make proto-check`
Expected: PASS (regeneration is committed, `git diff --exit-code` clean after staging).

- [ ] **Step 4: Commit**

```bash
git add proto/photo/v1/processing.proto packages/proto-ts/src/photo/v1/processing.ts
git commit -m "feat(proto): async media-processing job/result messages"
```

### Task 0.2: Python proto codegen

**Files:**
- Modify: `proto/buf.gen.yaml`
- Modify: `Makefile` (`proto-check` extends to the Python output path)
- Generated: `apps/media-worker/src/photoops_proto/photo/v1/processing_pb2.py` (+ `.pyi`)

**Interfaces:**
- Produces: importable Python module `photoops_proto.photo.v1.processing_pb2` with `ProcessPhotoJob`, `PhotoProcessingResult` having `.SerializeToString()` / `.ParseFromString()`.

- [ ] **Step 1: Add the Python plugin to `proto/buf.gen.yaml`**

```yaml
  - remote: buf.build/protocolbuffers/python
    out: ../apps/media-worker/src/photoops_proto
  - remote: buf.build/protocolbuffers/pyi
    out: ../apps/media-worker/src/photoops_proto
```

- [ ] **Step 2: Generate**

Run: `make proto`
Expected: `apps/media-worker/src/photoops_proto/photo/v1/processing_pb2.py` (+ `common`, `photo_service`) generated. Add an `__init__.py` to each generated package dir if imports require it (verify by import in Step 4).

- [ ] **Step 3: Extend drift check** — in `Makefile`, change the `proto-check` body to also diff the Python output:

```makefile
proto-check:
	pnpm proto
	git diff --exit-code -- packages/proto-ts apps/media-worker/src/photoops_proto
```

- [ ] **Step 4: Verify importability**

Run: `cd apps/media-worker && python -c "from src.photoops_proto.photo.v1 import processing_pb2; print(processing_pb2.ProcessPhotoJob().DESCRIPTOR.full_name)"`
Expected: prints `photoops.photo.v1.ProcessPhotoJob` (install `protobuf` first if missing — done in Task 0.3; if import path differs, adjust package `__init__.py`).
**If buf's Python remote plugin is unavailable/host-blocked, STOP and escalate (infra) per the global constraint.**

- [ ] **Step 5: Commit**

```bash
git add proto/buf.gen.yaml Makefile apps/media-worker/src/photoops_proto
git commit -m "build(proto): generate Python stubs for media-worker"
```

### Task 0.3: media-worker Python toolchain + gate wiring

**Files:**
- Modify: `apps/media-worker/pyproject.toml`, `apps/media-worker/Dockerfile`
- Modify: `Makefile`, `.github/workflows/ci.yml`
- Create: `apps/media-worker/tests/test_smoke.py`

**Interfaces:**
- Produces: `make test-media-worker` and `make lint-media-worker` targets; a CI job running them; `pytest`/`ruff`/`mypy` configured.

- [ ] **Step 1: Declare deps + tooling in `pyproject.toml`**

```toml
[project]
name = "photoops-media-worker"
version = "0.0.0"
requires-python = ">=3.12"
dependencies = [
  "pika>=1.3.2",
  "minio>=7.2.0",
  "Pillow>=11.0.0",
  "piexif>=1.1.3",
  "protobuf>=5.27.0",
]

[project.optional-dependencies]
dev = ["pytest>=8.3.0", "ruff>=0.6.0", "mypy>=1.14.0"]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]

[tool.ruff]
line-length = 100
target-version = "py312"
[tool.ruff.lint]
select = ["E", "F", "W", "I"]
extend-exclude = ["src/photoops_proto"]

[tool.mypy]
python_version = "3.12"
warn_unused_configs = true
exclude = ["src/photoops_proto"]
```

- [ ] **Step 2: Write a smoke test** — `apps/media-worker/tests/test_smoke.py`:

```python
def test_imports_pillow_and_pika():
    import PIL  # noqa: F401
    import pika  # noqa: F401
```

- [ ] **Step 3: Install + run, verify pass**

Run: `cd apps/media-worker && python -m pip install -e ".[dev]" && python -m pytest -q`
Expected: 1 passed. (If the host blocks pip, escalate per infra constraint.)

- [ ] **Step 4: Add Makefile targets**

```makefile
test-media-worker:
	cd apps/media-worker && python -m pip install -q -e ".[dev]" && python -m pytest -q

lint-media-worker:
	cd apps/media-worker && ruff check src tests && mypy src
```

- [ ] **Step 5: Add CI job** — in `.github/workflows/ci.yml` add a second job `media-worker` using `actions/setup-python@v5` (python 3.12) that runs `make proto` (needs buf — reuse pnpm/buf setup or `pip`-less buf action) then `make test-media-worker`. Keep it a separate job from `quality`. (If buf-in-CI for Python is non-trivial, gate Python tests on the committed generated stubs instead of regenerating; note this in the job comment.)

- [ ] **Step 6: Update Dockerfile**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY apps/media-worker /app
RUN pip install --no-cache-dir -e .
CMD ["python", "-m", "src.main"]
```

- [ ] **Step 7: Commit**

```bash
git add apps/media-worker/pyproject.toml apps/media-worker/Dockerfile apps/media-worker/tests Makefile .github/workflows/ci.yml
git commit -m "build(media-worker): python toolchain, pytest, lint, CI job"
```

### Task 0.4: Transport port + in-memory fake (TypeScript)

**Files:**
- Create: `apps/photo-service/src/messaging/messaging.port.ts`
- Create: `apps/photo-service/src/messaging/in-memory-bus.ts`
- Test: `apps/photo-service/src/messaging/in-memory-bus.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface BusMessage { body: Uint8Array; correlationId: string; }
  export interface MessagePublisher { publish(destination: string, msg: BusMessage): Promise<void>; }
  export interface MessageConsumer { consume(source: string, handler: (msg: BusMessage) => Promise<void>): Promise<void>; }
  export class InMemoryBus implements MessagePublisher, MessageConsumer { /* routes destination→source by name */ }
  ```
  `destination`/`source` are logical names (e.g. `"photo.process"`, `"photo.result"`); broker topology is the adapter's concern.

- [ ] **Step 1: Write the failing test** — `in-memory-bus.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { InMemoryBus } from './in-memory-bus';

describe('InMemoryBus', () => {
  it('delivers a published message to a consumer on the same name, ack on success', async () => {
    const bus = new InMemoryBus();
    const received: string[] = [];
    await bus.consume('photo.process', async (m) => { received.push(m.correlationId); });
    await bus.publish('photo.process', { body: new Uint8Array([1]), correlationId: 'corr-1' });
    await bus.drain();
    expect(received).toEqual(['corr-1']);
  });

  it('redelivers when the handler throws, then stops after success', async () => {
    const bus = new InMemoryBus();
    let attempts = 0;
    await bus.consume('q', async () => { attempts++; if (attempts < 2) throw new Error('boom'); });
    await bus.publish('q', { body: new Uint8Array(), correlationId: 'c' });
    await bus.drain();
    expect(attempts).toBe(2);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd apps/photo-service && npx vitest run src/messaging/in-memory-bus.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** the port interfaces in `messaging.port.ts` and `InMemoryBus` in `in-memory-bus.ts`. `InMemoryBus` keeps a `Map<string, handler>`, `publish` enqueues, `drain()` runs the queue, retrying a throwing handler up to 3 times then dropping (mirrors at-least-once + retry). Export a `drain()` helper for tests.

- [ ] **Step 4: Run, verify pass**

Run: `cd apps/photo-service && npx vitest run src/messaging/in-memory-bus.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/photo-service/src/messaging/messaging.port.ts apps/photo-service/src/messaging/in-memory-bus.ts apps/photo-service/src/messaging/in-memory-bus.spec.ts
git commit -m "feat(photo-service): transport port + in-memory bus fake"
```

### Task 0.5: Transport port + in-memory fake (Python)

**Files:**
- Create: `apps/media-worker/src/media_worker/__init__.py`, `apps/media-worker/src/media_worker/messaging/__init__.py`, `apps/media-worker/src/media_worker/messaging/port.py`, `.../messaging/in_memory.py`
- Test: `apps/media-worker/tests/test_in_memory_bus.py`

**Interfaces:**
- Produces (Python):
  ```python
  @dataclass
  class BusMessage:
      body: bytes
      correlation_id: str
  class MessagePublisher(Protocol):
      def publish(self, destination: str, message: BusMessage) -> None: ...
  class MessageConsumer(Protocol):
      def consume(self, source: str, handler: Callable[[BusMessage], None]) -> None: ...
  class InMemoryBus:  # implements both; .drain() for tests; retry≤3 on exception
  ```

- [ ] **Step 1: Write the failing test** — `tests/test_in_memory_bus.py`:

```python
from src.media_worker.messaging.in_memory import InMemoryBus, BusMessage

def test_delivers_to_handler_on_same_name():
    bus = InMemoryBus()
    seen = []
    bus.consume("photo.process", lambda m: seen.append(m.correlation_id))
    bus.publish("photo.process", BusMessage(body=b"x", correlation_id="corr-1"))
    bus.drain()
    assert seen == ["corr-1"]

def test_retries_on_exception_then_stops():
    bus = InMemoryBus()
    attempts = {"n": 0}
    def handler(_m):
        attempts["n"] += 1
        if attempts["n"] < 2:
            raise RuntimeError("boom")
    bus.consume("q", handler)
    bus.publish("q", BusMessage(body=b"", correlation_id="c"))
    bus.drain()
    assert attempts["n"] == 2
```

- [ ] **Step 2: Run, verify fail**

Run: `cd apps/media-worker && python -m pytest tests/test_in_memory_bus.py -q`
Expected: FAIL (import error).

- [ ] **Step 3: Implement** `BusMessage`, the `Protocol`s in `port.py`, and `InMemoryBus` in `in_memory.py` (dict of name→handler, queue, `drain()` runs with retry≤3 then drop). Add `__init__.py` files.

- [ ] **Step 4: Run, verify pass**

Run: `cd apps/media-worker && python -m pytest tests/test_in_memory_bus.py -q`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/media-worker/src/media_worker apps/media-worker/tests/test_in_memory_bus.py
git commit -m "feat(media-worker): transport port + in-memory bus fake"
```

---

## Phase 1 — photo-service: data model, producer, finalize

### Task 1.1: Schema migration + Drizzle schema

**Files:**
- Create: `apps/photo-service/migrations/0002_media_processing.sql`
- Modify: `apps/photo-service/src/db/schema.ts`
- Modify: `Makefile` (`migrate-photo` applies 0002)

**Interfaces:**
- Produces Drizzle tables: extended `photoAssets` (+`width,height,takenAtLocal,takenAtUtc,takenAtTzSource,cameraMake,cameraModel,orientation,lat,lon,metadataJson`), new `photoVariants`, new `processingJobs` exports.

- [ ] **Step 1: Write the migration** — `0002_media_processing.sql`, idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`):
  - `ALTER TABLE photo_assets ADD COLUMN IF NOT EXISTS width int`, `height int`, `taken_at_local timestamp`, `taken_at_utc timestamptz`, `taken_at_tz_source text`, `camera_make text`, `camera_model text`, `orientation smallint`, `lat double precision`, `lon double precision`, `metadata_json jsonb`.
  - `CREATE TABLE IF NOT EXISTS photo_variants (...)` with `UNIQUE (photo_id, variant_type)` and `CHECK (variant_type IN ('thumbnail','preview'))` exactly as the spec table.
  - `CREATE TABLE IF NOT EXISTS processing_jobs (...)` with `CHECK (type IN ('initial','reprocess'))`, `CHECK (status IN ('queued','succeeded','failed'))`, `INDEX (photo_id)`, as the spec table.
- [ ] **Step 2: Mirror in `schema.ts`** — add the columns to `photoAssets`; add `photoVariants` and `processingJobs` `pgTable` definitions with a unique index `photo_variants_photo_type_uq` on `(photoId, variantType)` and `processing_jobs_photo_idx` on `(photoId)`. Use `jsonb('metadata_json')`, `doublePrecision`, `smallint`, `timestamp(... withTimezone:false)` for `takenAtLocal`.
- [ ] **Step 3: Typecheck**

Run: `cd apps/photo-service && npx tsc --noEmit`
Expected: PASS (schema compiles).

- [ ] **Step 4: Wire migration into `make migrate-photo`** — append a line applying `apps/photo-service/migrations/0002_media_processing.sql` after the 0001 line (same psql pattern).
- [ ] **Step 5: Commit**

```bash
git add apps/photo-service/migrations/0002_media_processing.sql apps/photo-service/src/db/schema.ts Makefile
git commit -m "feat(photo-service): media-processing schema (variants, jobs, attributes)"
```

### Task 1.2: Record types

**Files:**
- Modify: `apps/photo-service/src/photo/photo.types.ts`

**Interfaces:**
- Produces: extend `PhotoAssetRecord` with the nullable attribute fields (`width: number | null`, …, `takenAtLocal: Date | null`, `takenAtUtc: Date | null`, `takenAtTzSource: string | null`, `lat: number | null`, `lon: number | null`, `metadataJson: unknown | null`); add `PhotoVariantRecord{ id, photoId, variantType: 'thumbnail'|'preview', objectKey, width, height, sizeBytes: bigint, contentType, createdAt, updatedAt }`; add `ProcessingJobRecord{ id, photoId, userId, type: 'initial'|'reprocess', status: 'queued'|'succeeded'|'failed', correlationId: string|null, errorMessage: string|null, startedAt: Date|null, finishedAt: Date|null }`; add `ProcessingResultInput` (the decoded result shape the domain consumes).

- [ ] **Step 1: Add the types** as above (pure type file; no test).
- [ ] **Step 2: Typecheck**

Run: `cd apps/photo-service && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/photo-service/src/photo/photo.types.ts
git commit -m "feat(photo-service): record types for variants, jobs, attributes"
```

### Task 1.3: Repository methods (job/variant/attribute/finalize/detail)

**Files:**
- Modify: `apps/photo-service/src/photo/photo.repository.ts`

**Interfaces:**
- Produces (on `PhotoRepository`):
  - `createProcessingJob(input: { photoId; userId; type; correlationId }): Promise<ProcessingJobRecord>` (UUIDv7 id, status `queued`, `startedAt = now`).
  - `markProcessingForUser(userId, photoId): Promise<void>` — guarded `UPDATE … SET status='processing' WHERE id AND user_id AND status='uploaded'`.
  - `finalizeJob(jobId, outcome: 'succeeded'|'failed', errorMessage?): Promise<boolean>` — guarded `UPDATE processing_jobs SET status=$outcome, finished_at=now WHERE id=$jobId AND status='queued'`; returns `rowCount === 1` (the idempotency gate).
  - `upsertVariant(v: Omit<PhotoVariantRecord,'id'|'createdAt'|'updatedAt'>): Promise<void>` — `INSERT … ON CONFLICT (photo_id, variant_type) DO UPDATE SET object_key, width, height, size_bytes, content_type, updated_at=now`.
  - `applyAttributes(photoId, attrs): Promise<void>` — `UPDATE photo_assets SET width,…,metadata_json, updated_at=now WHERE id`.
  - `setStatus(photoId, status): Promise<void>`.
  - `findByIdWithVariantsForUser(userId, photoId): Promise<{ photo: PhotoAssetRecord; variants: PhotoVariantRecord[] } | null>`.
  - `listVariantsForPhotos(photoIds: string[]): Promise<PhotoVariantRecord[]>`.

- [ ] **Step 1: Implement** the methods using the existing Drizzle patterns in this file (e.g. `desc`, `and`, `eq`, `.returning()`). For `finalizeJob`, use the pg result `rowCount`. (No unit test — repository SQL is covered by the Task 4.2 integration test, matching the repo's existing no-repository-unit-test convention.)
- [ ] **Step 2: Typecheck + build**

Run: `cd apps/photo-service && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/photo-service/src/photo/photo.repository.ts
git commit -m "feat(photo-service): repository ops for jobs, variants, finalize, detail"
```

### Task 1.4: Domain — publish job on CompleteUpload

**Files:**
- Modify: `apps/photo-service/src/photo/photo.service.ts`
- Create: `apps/photo-service/src/photo/processing.codec.ts` (encode `ProcessPhotoJob`, decode `PhotoProcessingResult` via `@photoops/proto-ts`)
- Test: `apps/photo-service/src/photo/photo.service.spec.ts` (extend)

**Interfaces:**
- Consumes: `MessagePublisher` (Task 0.4), repository (Task 1.3), `ProcessPhotoJob` codec.
- Produces: `PhotoDomainService` constructor gains a `publisher: MessagePublisher` param; `completeUpload` now also creates a job, marks `processing`, and publishes a `ProcessPhotoJob` to `"photo.process"`. Add `processing.codec.ts` exports `encodeJob(job): Uint8Array`, `decodeResult(body): ProcessingResultInput`.

- [ ] **Step 1: Write the failing test** — extend the existing spec; add a `publisher = { publish: vi.fn() }` to `createService()` and pass it to `new PhotoDomainService(repository, storage, publisher)`:

```ts
it('on complete upload: marks processing, creates a job, publishes ProcessPhotoJob', async () => {
  const { service, repository, storage, publisher } = createService();
  repository.findByIdForUser.mockResolvedValue({ id: 'p1', userId: 'u1', objectKey: 'originals/p1/a.jpg', status: 'uploaded' });
  storage.objectExists.mockResolvedValue(true);
  repository.markProcessingForUser.mockResolvedValue(undefined);
  repository.createProcessingJob.mockResolvedValue({ id: 'job-1', photoId: 'p1', userId: 'u1', type: 'initial' });

  await service.completeUpload('u1', 'p1');

  expect(repository.markProcessingForUser).toHaveBeenCalledWith('u1', 'p1');
  expect(repository.createProcessingJob).toHaveBeenCalledWith(expect.objectContaining({ photoId: 'p1', userId: 'u1', type: 'initial' }));
  expect(publisher.publish).toHaveBeenCalledWith('photo.process', expect.objectContaining({ correlationId: expect.any(String) }));
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd apps/photo-service && npx vitest run src/photo/photo.service.spec.ts -t "publishes ProcessPhotoJob"`
Expected: FAIL.

- [ ] **Step 3: Implement** — add `publisher` to the constructor; in `completeUpload`, keep the existing existence/ownership checks, then mark uploaded→processing (`markProcessingForUser`), `createProcessingJob`, generate a `correlationId` (uuidv7), `encodeJob({ jobId, photoId, userId, objectKey, type: INITIAL, correlationId })`, and `publisher.publish('photo.process', { body, correlationId })`. Implement `processing.codec.ts` using the generated `ProcessPhotoJob` Fns (`ProcessPhotoJob.encode(msg).finish()`).
- [ ] **Step 4: Run, verify pass** (and full file)

Run: `cd apps/photo-service && npx vitest run src/photo/photo.service.spec.ts`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add apps/photo-service/src/photo/photo.service.ts apps/photo-service/src/photo/processing.codec.ts apps/photo-service/src/photo/photo.service.spec.ts
git commit -m "feat(photo-service): publish processing job on complete upload"
```

### Task 1.5: Domain — finalize result (idempotent)

**Files:**
- Modify: `apps/photo-service/src/photo/photo.service.ts`
- Test: `apps/photo-service/src/photo/photo.service.spec.ts` (extend)

**Interfaces:**
- Produces: `PhotoDomainService.finalizeResult(result: ProcessingResultInput): Promise<void>` — calls `repository.finalizeJob(jobId, outcome)`; if it returns `false` (duplicate), return early; on `succeeded`: `upsertVariant` for each variant, `applyAttributes`, `setStatus(photoId,'ready')`; on `failed`: `setStatus(photoId,'failed')`.

- [ ] **Step 1: Write the failing tests**:

```ts
it('finalize SUCCEEDED: upserts variants, applies attributes, marks ready', async () => {
  const { service, repository } = createService();
  repository.finalizeJob.mockResolvedValue(true);
  await service.finalizeResult({ jobId: 'j1', photoId: 'p1', outcome: 'succeeded',
    attributes: { width: 100, height: 50 }, variants: [{ variantType: 'thumbnail', objectKey: 'variants/p1/thumbnail.jpg', width: 100, height: 50, sizeBytes: 10n, contentType: 'image/jpeg' }], metadataJson: '{}' });
  expect(repository.upsertVariant).toHaveBeenCalledTimes(1);
  expect(repository.applyAttributes).toHaveBeenCalledWith('p1', expect.objectContaining({ width: 100 }));
  expect(repository.setStatus).toHaveBeenCalledWith('p1', 'ready');
});

it('finalize is idempotent: duplicate result (finalizeJob=false) writes nothing', async () => {
  const { service, repository } = createService();
  repository.finalizeJob.mockResolvedValue(false);
  await service.finalizeResult({ jobId: 'j1', photoId: 'p1', outcome: 'succeeded', attributes: {}, variants: [], metadataJson: '{}' });
  expect(repository.upsertVariant).not.toHaveBeenCalled();
  expect(repository.setStatus).not.toHaveBeenCalled();
});

it('finalize FAILED: marks failed', async () => {
  const { service, repository } = createService();
  repository.finalizeJob.mockResolvedValue(true);
  await service.finalizeResult({ jobId: 'j1', photoId: 'p1', outcome: 'failed', errorMessage: 'bad', variants: [], metadataJson: '' });
  expect(repository.setStatus).toHaveBeenCalledWith('p1', 'failed');
});
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run src/photo/photo.service.spec.ts -t "finalize"` → FAIL.
- [ ] **Step 3: Implement** `finalizeResult` as specified (add the new repo methods to the mock object in `createService()`).
- [ ] **Step 4: Run, verify pass** — `npx vitest run src/photo/photo.service.spec.ts` → PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/photo-service/src/photo/photo.service.ts apps/photo-service/src/photo/photo.service.spec.ts
git commit -m "feat(photo-service): idempotent finalize of processing result"
```

### Task 1.6: Result consumer

**Files:**
- Create: `apps/photo-service/src/photo/processing.consumer.ts`
- Test: `apps/photo-service/src/photo/processing.consumer.spec.ts`

**Interfaces:**
- Consumes: `MessageConsumer`, `decodeResult` (codec), `PhotoDomainService.finalizeResult`.
- Produces: `class ProcessingResultConsumer { constructor(consumer, service); start(): Promise<void> }` — subscribes to `"photo.result"`, decodes each body, calls `service.finalizeResult`.

- [ ] **Step 1: Write the failing test** — use `InMemoryBus`: publish an encoded `PhotoProcessingResult`, start the consumer with a stub service, assert `finalizeResult` is called with the decoded shape.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** the consumer (decode in the handler; throw to trigger retry on transient failures).
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit**

```bash
git add apps/photo-service/src/photo/processing.consumer.ts apps/photo-service/src/photo/processing.consumer.spec.ts
git commit -m "feat(photo-service): result-queue consumer wiring"
```

---

## Phase 2 — media-worker: image processing pipeline

All Phase 2 logic is pure/unit-tested with fakes (in-memory bus, a fake storage, in-memory Pillow images). No real broker/MinIO until Task 4.2.

### Task 2.1: Config + storage client

**Files:**
- Create: `apps/media-worker/src/media_worker/config.py`, `apps/media-worker/src/media_worker/storage.py`
- Test: `apps/media-worker/tests/test_storage.py`

**Interfaces:**
- Produces:
  - `config.load() -> Config` with fields `minio_endpoint, minio_access_key, minio_secret_key, minio_bucket, rabbitmq_url` from env (`MINIO_ENDPOINT`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_BUCKET`, `RABBITMQ_URL`).
  - `class ObjectStore(Protocol)`: `download(object_key) -> bytes`, `upload(object_key, data: bytes, content_type: str, metadata: dict[str,str]) -> int` (returns size), `head(object_key) -> dict[str,str] | None` (returns metadata or None).
  - `class MinioObjectStore(ObjectStore)` wrapping the `minio` client; a `FakeObjectStore` for tests (an in-dict store) lives in the test module or a `tests/fakes.py`.

- [ ] **Step 1: Write the failing test** — `test_storage.py`: a `FakeObjectStore` round-trips upload→download and head returns stored metadata; head of a missing key returns `None`. (Tests the fake's contract that production code depends on; `MinioObjectStore` itself is covered by Task 4.2 integration.)
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `config.py` (`os.getenv` with the documented defaults), the `ObjectStore` Protocol, `MinioObjectStore` (using `minio.Minio`, `get_object`, `put_object` with `metadata=`, `stat_object` for head → catch `S3Error` NoSuchKey → None), and `FakeObjectStore` in `tests/fakes.py`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat(media-worker): config + object-store port`.

### Task 2.2: Imaging — orient, resize, strip, encode

**Files:**
- Create: `apps/media-worker/src/media_worker/imaging.py`
- Test: `apps/media-worker/tests/test_imaging.py`

**Interfaces:**
- Produces:
  - `RENDITIONS = {"thumbnail": 320, "preview": 1600}` (fit box, long edge).
  - `render_variant(original: bytes, box: int) -> RenderedVariant` where `RenderedVariant{ data: bytes, width: int, height: int, content_type: "image/jpeg" }`. Behavior: load (format-agnostic via `PIL.Image.open`), apply `ImageOps.exif_transpose` (auto-orient), fit within `box×box` preserving aspect, **never upscale**, strip metadata (re-encode JPEG q≈82, no exif), return oriented dimensions.

- [ ] **Step 1: Write the failing tests** — build originals in-memory with Pillow:

```python
import io
from PIL import Image
from src.media_worker.imaging import render_variant

def _jpeg(w, h):
    buf = io.BytesIO(); Image.new("RGB", (w, h), (120, 40, 200)).save(buf, format="JPEG"); return buf.getvalue()

def test_downscales_within_box_preserving_aspect():
    out = render_variant(_jpeg(4000, 2000), 320)
    assert max(out.width, out.height) == 320
    assert (out.width, out.height) == (320, 160)
    assert out.content_type == "image/jpeg"

def test_does_not_upscale_small_images():
    out = render_variant(_jpeg(100, 50), 320)
    assert (out.width, out.height) == (100, 50)

def test_strips_exif_from_output():
    out = render_variant(_jpeg(800, 600), 320)
    assert Image.open(io.BytesIO(out.data)).getexif() == Image.Exif()  # empty
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `render_variant` (use `ImageOps.exif_transpose`, `Image.thumbnail((box,box))` which never upscales and preserves aspect, convert to RGB, save JPEG without exif).
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat(media-worker): variant rendering (orient/fit/no-upscale/strip)`.

### Task 2.3: EXIF extraction + taken_at TZ model

**Files:**
- Create: `apps/media-worker/src/media_worker/exif.py`
- Test: `apps/media-worker/tests/test_exif.py`

**Interfaces:**
- Produces: `extract_attributes(original: bytes) -> Attributes` where `Attributes{ width, height, taken_at_local: str|"", taken_at_utc: str|"", taken_at_tz_source: "exif_offset"|"gps_time"|"unknown", camera_make: str|"", camera_model: str|"", orientation: int, lat: float|None, lon: float|None, metadata_json: str }`. Dimensions are oriented. `taken_at_local` from `DateTimeOriginal` (fallback `DateTimeDigitized`). UTC: from `OffsetTimeOriginal` (→`exif_offset`) else `GPSDateStamp`+`GPSTimeStamp` (→`gps_time`) else `""`/`unknown`. GPS DMS+ref → signed decimal, range-validated (invalid→None). `metadata_json` = sanitized full EXIF (drop MakerNote/thumbnail/binary; rationals→float). Missing/malformed EXIF never raises — return what is valid.

- [ ] **Step 1: Write the failing tests** — craft inputs with `piexif`:

```python
import io, piexif
from PIL import Image
from src.media_worker.exif import extract_attributes

def _with_exif(exif_dict, w=800, h=600):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (1, 2, 3)).save(buf, format="JPEG", exif=piexif.dump(exif_dict))
    return buf.getvalue()

def test_dimensions_always_present_even_without_exif():
    a = extract_attributes(_with_exif({}))
    assert (a.width, a.height) == (800, 600)
    assert a.taken_at_tz_source == "unknown" and a.taken_at_utc == ""

def test_taken_at_local_and_offset_to_utc():
    exif = {"Exif": {piexif.ExifIFD.DateTimeOriginal: b"2026:01:02 09:30:00",
                     piexif.ExifIFD.OffsetTimeOriginal: b"+03:00"}}
    a = extract_attributes(_with_exif(exif))
    assert a.taken_at_local == "2026-01-02T09:30:00"
    assert a.taken_at_utc == "2026-01-02T06:30:00" and a.taken_at_tz_source == "exif_offset"

def test_gps_dms_to_decimal():
    gps = {"GPS": {piexif.GPSIFD.GPSLatitudeRef: b"N", piexif.GPSIFD.GPSLatitude: ((34,1),(3,1),(0,1)),
                   piexif.GPSIFD.GPSLongitudeRef: b"W", piexif.GPSIFD.GPSLongitude: ((118,1),(15,1),(0,1))}}
    a = extract_attributes(_with_exif(gps))
    assert round(a.lat, 3) == 34.050 and round(a.lon, 3) == -118.250
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `extract_attributes` (parse with `piexif.load` defensively in try/except; helpers for DMS→decimal, offset parsing, GPS-time→UTC; build sanitized dict for `metadata_json`).
- [ ] **Step 4: Run, verify pass** (add a malformed-exif test asserting no raise).
- [ ] **Step 5: Commit** `feat(media-worker): EXIF/GPS extraction with taken_at TZ model`.

### Task 2.4: Job handler — claim, process, publish result

**Files:**
- Create: `apps/media-worker/src/media_worker/codec.py` (proto encode/decode), `apps/media-worker/src/media_worker/handler.py`
- Test: `apps/media-worker/tests/test_handler.py`

**Interfaces:**
- Consumes: `ObjectStore`, `MessagePublisher`, `RENDITIONS`, `render_variant`, `extract_attributes`, proto `processing_pb2`.
- Produces:
  - `codec.decode_job(body: bytes) -> ProcessPhotoJob`, `codec.encode_result(...) -> bytes`.
  - `class JobHandler{ __init__(store, publisher, result_dest="photo.result"); handle(message: BusMessage) -> None }`. Logic: decode job; for each rendition, compute deterministic key `variants/{photo_id}/{variant_type}.jpg`; **claim**: `store.head(key)`; if all variant keys exist with `metadata["job-id"] == job_id`, skip re-encode and reconstruct `VariantResult` from head metadata (`width`,`height`) + a cheap `extract_attributes`; else `render_variant` + `store.upload(key, data, "image/jpeg", {"job-id": job_id, "width": ..., "height": ...})`. Extract attributes once. Build `PhotoProcessingResult(outcome=SUCCEEDED, ...)`; on any exception build `outcome=FAILED, error_message=str(e)`. Publish encoded result to `result_dest` with the job's `correlation_id`.

- [ ] **Step 1: Write the failing tests** — with `FakeObjectStore` + `InMemoryBus`:
  - success: seed an original at its object_key, hand the handler an encoded job, assert two variant objects written under deterministic keys, a `PhotoProcessingResult` published with `outcome=SUCCEEDED`, 2 variants, width/height set.
  - claim/no-double-encode: pre-seed both variant objects tagged `job-id`; spy/patch `render_variant` to raise if called; assert it is **not** called and a SUCCEEDED result is still published.
  - failure: seed a non-image original (`b"not an image"`); assert a `FAILED` result with non-empty `error_message` is published and status path is failure.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `codec.py` and `JobHandler.handle` as specified.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat(media-worker): job handler with MinIO-metadata claim + result publish`.

### Task 2.5: App wiring (consume loop)

**Files:**
- Create: `apps/media-worker/src/media_worker/messaging/rabbitmq.py`, `apps/media-worker/src/media_worker/app.py`
- Modify: `apps/media-worker/src/main.py`
- Test: `apps/media-worker/tests/test_app.py` (wiring with `InMemoryBus` + fakes; the real `RabbitMqBus` is covered by Task 4.2)

**Interfaces:**
- Produces: `RabbitMqBus(url)` implementing the port (`pika` BlockingConnection; `publish` to an exchange/routing-key derived from the logical name; `consume` with manual ack, `basic_nack` requeue with a redelivery cap → dead-letter); `app.run(config, store_factory, bus_factory)` that wires `JobHandler` onto `consume("photo.process")`; `main.py` calls `app.run(config.load(), ...)`. Keep the health endpoint or drop it (worker liveness is the consumer connection) — note the choice in `apps/media-worker/CLAUDE.md`.

- [ ] **Step 1: Write the failing test** — `test_app.py`: build the wiring with `InMemoryBus` + `FakeObjectStore`, publish a job, drain, assert a result was published on `photo.result`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `app.run` (dependency-injected factories so tests use fakes); `RabbitMqBus` (declare durable queues/exchanges + DLX, persistent delivery, prefetch=1); `main.py` entrypoint.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Update** `apps/media-worker/CLAUDE.md` (Local context/invariants: real consumer now) and commit `feat(media-worker): rabbitmq adapter + consume loop`.

---

## Phase 3 — Delivery API (variants, detail, list fields)

### Task 3.1: Presigned GET for variants

**Files:**
- Modify: `apps/photo-service/src/storage/minio.service.ts`
- Test: `apps/photo-service/src/storage/minio.service.spec.ts` (extend)

**Interfaces:**
- Produces: `ObjectStoragePort.createPresignedGetUrl(objectKey: string, expiresIn?: number): Promise<string>` + `MinioStorageService` impl (uses `GetObjectCommand` + `getSignedUrl` on the browser-endpoint client so URLs are reachable from the browser).

- [ ] **Step 1: Write the failing test** — follow the existing `minio.service.spec.ts` style; assert `createPresignedGetUrl('variants/p1/preview.jpg')` returns a URL string containing the key. (If the existing spec mocks the S3 signer, mirror it; otherwise assert shape.)
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `createPresignedGetUrl` and add it to `ObjectStoragePort`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat(photo-service): owner-scoped presigned GET for variants`.

### Task 3.2: Proto — PhotoAsset attributes + variant views + GetPhoto

**Files:**
- Modify: `proto/photo/v1/photo_service.proto`
- Test: `make proto` + `make proto-check`

**Interfaces:**
- Produces: `PhotoAsset` gains `width, height, taken_at_local, taken_at_utc, taken_at_tz_source, camera_make, camera_model, orientation, lat (optional), lon (optional)` and `repeated PhotoVariantView variants` where `PhotoVariantView{ variant_type, url, width, height }`; new `GetPhotoRequest{ photo_id, user_id }` and rpc `GetPhoto(GetPhotoRequest) returns (PhotoAsset)` (with `google.api.http` GET `/v1/photos/{photo_id}`). Use new field numbers (10+) to avoid breaking existing ones.

- [ ] **Step 1: Edit the proto** adding the fields/rpc with fresh tag numbers.
- [ ] **Step 2: Regenerate** — `make proto` → updated `photo_service.ts`.
- [ ] **Step 3: Drift check** — `make proto-check` → PASS.
- [ ] **Step 4: Commit** `feat(proto): photo attributes, variant views, GetPhoto`.

### Task 3.3: photo-service — GetPhoto + enriched ListPhotos

**Files:**
- Modify: `apps/photo-service/src/photo/photo.service.ts`, `apps/photo-service/src/photo/photo.grpc.controller.ts`
- Test: extend `photo.service.spec.ts`, `photo.grpc.controller.spec.ts`

**Interfaces:**
- Produces:
  - `PhotoDomainService.getPhoto(userId, photoId): Promise<{ photo; variants } | null>` (via `findByIdWithVariantsForUser`), and `listPhotos` returns photos + their variants (via `listVariantsForPhotos`).
  - Controller `GetPhoto` handler; a shared `toProtoPhoto(record, variants, presign)` mapper that fills attribute fields and builds `variants[]` with a presigned `url` per variant (calling `storage.createPresignedGetUrl`). `ListPhotos` and `GetPhoto` both use it.

- [ ] **Step 1: Write failing tests** — domain `getPhoto` returns null when not owned; controller maps attributes + a variant url (mock `storage.createPresignedGetUrl` → `'signed://x'`); assert proto status enum + variant url present.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** the domain methods, the `toProtoPhoto` mapper (date→ISO string, bigint→string, presign per variant), and the `GetPhoto` `@GrpcMethod`.
- [ ] **Step 4: Run, verify pass** (full photo-service suite).
- [ ] **Step 5: Commit** `feat(photo-service): GetPhoto + variant URLs and attributes in list`.

### Task 3.4: api-gateway — detail route + field mapping

**Files:**
- Modify: `apps/api-gateway/src/grpc/photo.client.ts`, `apps/api-gateway/src/http/photo.controller.ts`
- Test: extend the gateway photo controller spec

**Interfaces:**
- Produces: `PhotoClient.getPhoto(userId, photoId)`; `GET /photos/:photoId` HTTP route (session-scoped, like the existing handlers); the list/detail `mapPhoto` now includes `width, height, takenAtLocal, takenAtUtc, takenAtTzSource, cameraMake, cameraModel, orientation, lat, lon, variants[]` (camelCase).

- [ ] **Step 1: Write failing tests** — controller returns 200 with the mapped detail (mock `PhotoClient.getPhoto`), 404 when null; `mapPhoto` includes the new fields + variants.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** the client method, route, and extended `mapPhoto`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat(api-gateway): photo detail route + attribute/variant mapping`.

---

## Phase 4 — Bootstrap wiring + local integration

### Task 4.1: Wire consumers + compose

**Files:**
- Modify: `apps/photo-service/src/app.module.ts`, `apps/photo-service/src/main.ts`, `apps/photo-service/src/messaging/rabbitmq-bus.ts` (create)
- Modify: `infra/docker/docker-compose.yml`
- Modify: `apps/photo-service/CLAUDE.md`

**Interfaces:**
- Produces: `RabbitMqBus` (TS, `amqplib`) implementing the port; `app.module` provides the bus + publisher + `ProcessingResultConsumer`; `main.ts` starts the gRPC server and the result consumer; `PhotoDomainService` factory `inject` now includes the publisher. `docker-compose.yml` media-worker gets `environment` (`MINIO_*`, `RABBITMQ_URL`) + `depends_on` (rabbitmq healthy, minio-init completed). Add `amqplib` + `@types/amqplib` to photo-service deps.

- [ ] **Step 1:** Add `amqplib` dep; implement `RabbitMqBus` (TS) mirroring the Python adapter topology (same exchange/queue/routing-key names: job `photo.process`, result `photo.result`, each with DLX). **Names must match the Python `RabbitMqBus` exactly** — define them once in a shared `messaging/topology.ts` constant and reference the same literals in Python (document the canonical names in the spec/CLAUDE.md).
- [ ] **Step 2:** Wire DI in `app.module.ts` (provide `RabbitMqBus` as both `MessagePublisher` token and the consumer's source; provide `ProcessingResultConsumer`) and start the consumer in `main.ts`.
- [ ] **Step 3:** Update `docker-compose.yml` media-worker service (env + depends_on).
- [ ] **Step 4: Typecheck + build + unit tests**

Run: `make typecheck && make build && make test`
Expected: PASS (no behavior change to unit tests; wiring compiles).

- [ ] **Step 5:** Update `apps/photo-service/CLAUDE.md` (producer + result consumer; broker port) and commit `feat: wire rabbitmq bus + result consumer + compose env`.

### Task 4.2: Local end-to-end integration

**Files:**
- Create: `scripts/smoke-media-processing.sh`
- Modify: `Makefile` (`smoke-media`, `test-integration` target — local only, not CI)

**Interfaces:**
- Produces: a script that, against `make dev` + `make migrate`, drives the full path and asserts the outcomes.

- [ ] **Step 1: Write the script** — sign up, create upload intent, PUT a real sample JPEG (with EXIF) to the presigned URL, call complete-upload, then poll `GET /photos/:id` until `status == ready` (timeout ~30s). Assert: status `ready`; `variants` contains `thumbnail` + `preview` with non-empty `url`; attribute fields populated (`width/height`, and `takenAt*`/`lat`/`lon` for the EXIF sample). Then call complete-upload/reprocess path again is out of scope; instead assert idempotency by re-publishing is covered by unit tests — the script asserts **exactly one** thumbnail + one preview row (query via the detail response `variants` length == 2).
- [ ] **Step 2: Run it against the local stack**

Run: `make dev` (separate terminal) → `make migrate` → `make smoke-media`
Expected: script exits 0 with `status=ready`, 2 variants, attributes present. **If the stack/broker/MinIO misbehaves, capture logs (`make logs`), diagnose, and escalate per the infra constraint — do not hand-patch infra.**

- [ ] **Step 3: Run the full gate**

Run: `make gate && make test-media-worker`
Expected: PASS.

- [ ] **Step 4: Commit** `test: local end-to-end media-processing smoke`.

---

## Self-Review

**Spec coverage** (each spec section → task):
- Architecture/data flow → Phase 1 (producer/finalize) + Phase 2 (worker) + Task 4.1 (wiring).
- Messaging abstraction (port + proto + fake + one real adapter) → 0.1, 0.2, 0.4, 0.5, 4.1.
- Queue topology + DLQ/retry → InMemoryBus retry (0.4/0.5), real adapters (2.5/4.1).
- Message contracts (proto) → 0.1; codecs 1.4/2.4.
- Data model (columns, photo_variants, processing_jobs) → 1.1/1.2/1.3.
- Status machine → 1.4 (uploaded→processing), 1.5 (→ready/failed).
- Idempotency (finalize by job_id, variant upsert, worker-claim) → 1.3/1.5 + 2.4.
- Variant generation (sizes, fit/no-upscale/strip/orient, JPEG, metadata) → 2.2 + 2.4.
- EXIF (columns, raw json, taken_at local/utc/source, defensive) → 2.3.
- Delivery API (presigned GET, GetPhoto, ListPhotos fields, gateway) → 3.1–3.4.
- Observability (correlation id end to end) → threaded in 1.4 (generate), carried through job/result, asserted implicitly. **Add:** ensure structured logs with the correlation id are emitted in the worker handler (2.4) and finalize (1.5) — fold a log line into those tasks' implementations.
- Usage readiness (processing_jobs + sizes; no emission) → 1.1/1.3 (record), no emission task (correct).
- Reprocessing seam (typed jobs, shared core) → `type` field in proto (0.1) + job creation (1.4); only `initial` emitted.
- Testing strategy → unit/component tasks throughout; integration 4.2.
- Python toolchain/CI → 0.3.

**Placeholder scan:** no TBDs. Two flagged escalation points (buf Python plugin in 0.2/0.3; infra in 4.2) are explicit per the user's directive, not hand-waves.

**Type consistency:** logical destination names `photo.process` / `photo.result` used consistently (0.4, 1.4, 1.6, 2.4, 2.5, 4.1 — centralized in `topology.ts` and mirrored in Python). `finalizeJob` returns boolean gate used by `finalizeResult`. Deterministic key `variants/{photo_id}/{variant_type}.jpg` used in 1.3 (upsert), 2.4 (write/claim). `ProcessingResultInput` decoded shape (1.2) consumed by 1.5/1.6 and produced by 2.4 codec.

**Gap fixed inline:** added the correlation-id structured-log requirement to tasks 1.5 and 2.4 (above).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-24-media-processing-backend.md`.

Beads: a session-008 epic + one issue per task should be created before coding (the next step). Execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks, fast iteration. REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.
2. **Inline Execution** — execute tasks in this session with checkpoints. REQUIRED SUB-SKILL: `superpowers:executing-plans`.
