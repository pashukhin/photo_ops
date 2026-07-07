# Pipeline Integrity Hardening + Demo Seed — Skeleton Commit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to fill this skeleton task-by-task — each task makes its RED tests green within the provided stubs. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three P2 redelivery/atomicity bugs (a photo can't get stuck in `processing` or be false-`FAILED` by a transient hiccup; a redelivered cluster job can't corrupt a result) and ship a one-command idempotent demo seed.

**Architecture / WHY:** exSDD skeleton-first. Each fix is an independent service/language slice with its own RED unit tier + a live `make smoke-*` on the crossed boundary. Entry points: design → `docs/superpowers/specs/2026-07-07-integrity-design.md`; 0od → media-worker `errors.py`/`messaging/retry.py` + `test_errors.py`/`test_handler.py`; opm → `photo.service.spec.ts`; 42b/1m8 → cluster `test_store.py`/`test_worker.py`; seed → `scripts/smoke-seed.sh`. Durable invariants land in each service's `## Local invariants` at GREEN, not here.

**Tech Stack:** Python 3.12 (media-worker, cluster-service; pytest + pytest-cov, pika, minio), TypeScript (photo-service; NestJS + drizzle + vitest), Bash (scripts; curl + jq + PIL/piexif fixture gen), RabbitMQ, MinIO, Postgres.

## Global Constraints

- Method: RED test reproducing each bug → minimal GREEN; **the plan authors the RED, not the GREEN**.
- Coverage-gate: 100% new/changed-line coverage (diff-cover). Thin IO that cannot be unit-instantiated (`MinioObjectStore` except-bodies, `_on_message` pika wiring, `store_postgres.save_tree`) is `# pragma: no cover` and smoke-verified.
- media-worker runs `--cov=src/media_worker` with **no omit list** — new LOGIC must be pure/unit-covered.
- test-integrity guard: removing/renaming-away a test declaration needs an `Allow-test-removal: <reason>` commit trailer.
- Broker topology is canonical/mirrored (media ↔ photo adapters) — **do not change topology constants**. The 0od retry republishes on the existing `photo.process` exchange; no new queues.
- Every commit ends with the `Co-Authored-By` trailer.
- Live smokes required green before final review: `make smoke-media`, `make smoke-cluster`, `make smoke-seed`.

## Non-Goals

- No new product features; geo / 9q4 release-readiness are 022+.
- No backoff/delay retry queue for 0od (immediate bounded republish, capped at N); a delay queue is deferred (topology is cross-cutting).
- No fix here for `photo_ops-55s` (result-consumer DLQs a transient *finalize* fault → strand); filed separately, documented as a known limitation.
- No single-transaction finalize (opm uses idempotent re-apply + winner-gate — settled at brainstorm).
- No deterministic cluster node-ids (42b uses skip-if-exists — settled).
- Seed idempotency converges on a fully-published run (fixed-title marker); a crash mid-build may orphan photos/cluster — accepted.

---

### Task 1: 0od — media-worker transient classification + bounded retry

**Files:**
- Stub: `apps/media-worker/src/media_worker/errors.py` (new — `TransientProcessingError`, `classify_storage_error`)
- Stub: `apps/media-worker/src/media_worker/messaging/retry.py` (new — `requeue_on`, `retry_attempt`, `should_retry`, `MAX_RETRY_ATTEMPTS`)
- Test: `apps/media-worker/tests/test_errors.py` (new — RED: classifier truth table + retry arithmetic)
- Test: `apps/media-worker/tests/test_handler.py` (modify — RED: transient propagates / permanent → FAILED)
- Modify (GREEN, not skeleton): `storage.py` (download/upload catch → `classify_storage_error` → re-raise `TransientProcessingError`), `handler.py` (`_handle` lets `TransientProcessingError` propagate), `messaging/rabbitmq.py:_on_message` (raw-pika bounded republish), `scripts/smoke-media-processing.sh` (permanent corrupt-image → `failed` assertion).

**Interfaces:**
- Produces: `TransientProcessingError(Exception)`; `classify_storage_error(exc: BaseException) -> bool` (True ⇒ transient); `requeue_on(exc: BaseException) -> bool`; `retry_attempt(headers: dict | None) -> int`; `should_retry(headers: dict | None, max_attempts: int) -> bool`; `MAX_RETRY_ATTEMPTS: int = 5`.
- Consumes: nothing from other tasks.

**GREEN obligation (for the implementer):** make the RED tests below pass within these stubs; wire `storage.py`/`handler.py`/`rabbitmq.py` and the smoke (smoke-only paths are `# pragma: no cover`). You may add narrower tests; you may not weaken/delete/rename these REDs.

- [ ] **Step 1: Write the RED tests** — `apps/media-worker/tests/test_errors.py`

```python
"""RED: transient/permanent taxonomy + bounded-retry arithmetic (0od)."""
import minio.error
import urllib3.exceptions
import pytest

from media_worker.errors import TransientProcessingError, classify_storage_error
from media_worker.messaging.retry import (
    MAX_RETRY_ATTEMPTS,
    requeue_on,
    retry_attempt,
    should_retry,
)


@pytest.mark.parametrize(
    "exc, transient",
    [
        # why: MinIO-unreachable surfaces as urllib3, NOT S3Error — the headline transient.
        (urllib3.exceptions.MaxRetryError(pool=None, url="x"), True),
        (urllib3.exceptions.ProtocolError("connection reset"), True),
        # why: 5xx without an XML body is minio.error.ServerError, not S3Error.
        (minio.error.ServerError("boom", 503), True),
        # why: throttling / server S3 codes are retryable.
        (minio.error.S3Error("SlowDown", "slow", "res", "req", "host", None), True),
        # why: a genuinely-absent original is permanent — retry won't help.
        (minio.error.S3Error("NoSuchKey", "missing", "res", "req", "host", None), False),
        # why: a bad image is permanent input, not a storage hiccup.
        (ValueError("cannot identify image file"), False),
    ],
)
def test_classify_storage_error(exc, transient):
    assert classify_storage_error(exc) is transient


def test_requeue_on_only_transient_marker():
    # why: the transport requeues ONLY our typed transient signal; everything else → DLQ.
    assert requeue_on(TransientProcessingError("x")) is True
    assert requeue_on(ValueError("x")) is False


def test_retry_attempt_reads_header_default_zero():
    # why: a first delivery has no header → attempt 0; the stamped header carries the count.
    assert retry_attempt(None) == 0
    assert retry_attempt({}) == 0
    assert retry_attempt({"x-attempt": 3}) == 3


def test_should_retry_is_bounded():
    # why: bounded — retry below the cap, give up (→ FAILED) at/above it. No infinite requeue.
    assert should_retry({"x-attempt": 0}, MAX_RETRY_ATTEMPTS) is True
    assert should_retry({"x-attempt": MAX_RETRY_ATTEMPTS - 1}, MAX_RETRY_ATTEMPTS) is True
    assert should_retry({"x-attempt": MAX_RETRY_ATTEMPTS}, MAX_RETRY_ATTEMPTS) is False
```

- [ ] **Step 2: Add the handler RED tests** — append to `apps/media-worker/tests/test_handler.py`

```python
def test_transient_error_propagates_and_publishes_no_failed():
    # why (0od): a transient storage error must NOT become a permanent FAILED; it
    # propagates so the transport can redeliver. Currently _handle catches it → FAILED.
    store = _StoreRaising(TransientProcessingError("minio down"))
    publisher = FakePublisher()
    handler = JobHandler(store, publisher)
    with pytest.raises(TransientProcessingError):
        handler.handle(_job_message())
    assert publisher.published == []  # no FAILED result emitted


def test_permanent_error_publishes_failed():
    # why (0od): genuinely bad input stays a permanent FAILED (acked, no redelivery).
    store = _StoreRaising(ValueError("cannot identify image file"))
    publisher = FakePublisher()
    handler = JobHandler(store, publisher)
    handler.handle(_job_message())
    assert len(publisher.published) == 1
    assert _outcome_of(publisher.published[0]) == PROCESSING_OUTCOME_FAILED
```

> Implementer note: `_StoreRaising`, `_job_message`, `_outcome_of`, `FakePublisher`
> reuse the existing `tests/fakes.py` shapes — a store double whose `download`
> raises the given exc, a valid encoded `ProcessPhotoJob` BusMessage, and a decoder
> for the published result's outcome. Add them to `fakes.py` if absent.

- [ ] **Step 3: Run the tests to confirm RED**

Run: `cd apps/media-worker && .venv/bin/python -m pytest tests/test_errors.py tests/test_handler.py -q`
Expected: FAIL — `test_errors` on `NotImplementedError` from the stubs; `test_handler` transient test fails because current `_handle` catches all and publishes FAILED (no raise).

- [ ] **Step 4: Write the stub signatures**

`apps/media-worker/src/media_worker/errors.py`:
```python
"""Processing error taxonomy (0od): transient (retry) vs permanent (FAILED)."""
from __future__ import annotations


class TransientProcessingError(Exception):
    """A retryable storage/IO hiccup — must NOT be turned into a permanent FAILED."""


def classify_storage_error(exc: BaseException) -> bool:
    """True iff *exc* is a transient storage error (retryable), else False (permanent)."""
    raise NotImplementedError  # GREEN is the implementer's job
```

`apps/media-worker/src/media_worker/messaging/retry.py`:
```python
"""Bounded-retry arithmetic for the transient-requeue path (0od). Pure helpers."""
from __future__ import annotations

MAX_RETRY_ATTEMPTS = 5  # NOT MAX_ATTEMPTS — avoids colliding with in_memory.py


def requeue_on(exc: BaseException) -> bool:
    raise NotImplementedError


def retry_attempt(headers: dict | None) -> int:
    raise NotImplementedError


def should_retry(headers: dict | None, max_attempts: int) -> bool:
    raise NotImplementedError
```

- [ ] **Step 5: Confirm still RED + typecheck clean**

Run: `cd apps/media-worker && .venv/bin/python -m pytest tests/test_errors.py tests/test_handler.py -q` (Expected: FAIL — symbols resolve, `test_errors` now RED on `NotImplementedError`, handler transient test RED on missing propagation) and `make lint-media-worker` (mypy clean on the new signatures).

- [ ] **Step 6: Commit the skeleton**

```bash
git add apps/media-worker/src/media_worker/errors.py apps/media-worker/src/media_worker/messaging/retry.py apps/media-worker/tests/test_errors.py apps/media-worker/tests/test_handler.py apps/media-worker/tests/fakes.py
git commit -m "skeleton(0od): transient taxonomy + bounded-retry helpers (RED + stubs)"
```

---

### Task 2: opm — photo-service idempotent finalize + winner-gate

**Files:**
- Test: `apps/photo-service/src/photo/photo.service.spec.ts` (modify — RED crash-recovery + regression guards)
- Modify (GREEN, not skeleton): `photo.service.ts:finalizeResult` (winner-gate + always-emit), the three existing finalize tests (`:368/:390/:425` seed `findJobById().status`), rename the `:382` test (+ `Allow-test-removal:` trailer).

**Interfaces:**
- Consumes: existing `PhotoRepositoryPort` (`finalizeJob`, `findJobById`, `upsertVariant`, `applyAttributes`, `setStatus`) and `UsageEmitterPort.emitProcessingConsumption`.
- Produces: no new symbols — a behavior change to `finalizeResult`.

**GREEN obligation (for the implementer):** make the crash-recovery RED pass by gating the terminal apply on `job.status === outcome` and always-emitting usage; keep the regression guards green; seed `status` in the three existing tests; repurpose+rename `:382`. Do not weaken the REDs.

- [ ] **Step 1: Write the RED + guard tests** — add to `photo.service.spec.ts`

```typescript
it('crash-recovery: redelivery (finalizeJob=false, same recorded outcome) re-applies terminal state → ready', async () => {
  // why (opm): a crash after finalizeJob but before setStatus strands the photo in
  // 'processing'. Redelivery finds finalizeJob=false; because the RECORDED winner is
  // 'succeeded', the idempotent terminal writes must still be applied. Current code
  // early-returns on !applied → nothing applied → RED.
  repository.finalizeJob.mockResolvedValue(false);
  repository.findJobById.mockResolvedValue({ id: 'j1', userId: 'u1', status: 'succeeded' });
  await service.finalizeResult({
    jobId: 'j1', photoId: 'p1', outcome: 'succeeded',
    attributes: {}, variants: [{ variantType: 'thumbnail', objectKey: 'k', width: 1, height: 1, sizeBytes: 1n, contentType: 'image/jpeg' }],
    metadataJson: '{}',
  });
  expect(repository.upsertVariant).toHaveBeenCalledTimes(1);
  expect(repository.setStatus).toHaveBeenCalledWith('p1', 'ready');
});

it('regression guard: a losing opposite-outcome duplicate does NOT clobber the winner', async () => {
  // why (M1): SUCCEEDED won (job.status='succeeded'); a redelivered FAILED for the
  // same job must be ignored, not flip the good photo to 'failed'. (Green already.)
  repository.finalizeJob.mockResolvedValue(false);
  repository.findJobById.mockResolvedValue({ id: 'j1', userId: 'u1', status: 'succeeded' });
  await service.finalizeResult({ jobId: 'j1', photoId: 'p1', outcome: 'failed', errorMessage: 'x', variants: [], metadataJson: '' });
  expect(repository.setStatus).not.toHaveBeenCalledWith('p1', 'failed');
});
```

- [ ] **Step 2: Run to confirm RED**

Run: `cd apps/photo-service && npx vitest run src/photo/photo.service.spec.ts -t 'crash-recovery'`
Expected: FAIL — current `finalizeResult` returns early at L211 on `!applied`, so `upsertVariant`/`setStatus` are never called.

- [ ] **Step 3: (no new stub — the "stub" is the existing buggy `finalizeResult`)**

The RED pins the obligation; the implementer changes `finalizeResult` at GREEN. No signature to add.

- [ ] **Step 4: Confirm RED holds + typecheck**

Run: same vitest command (Expected: FAIL on the `toHaveBeenCalledTimes(1)` assertion) and `make typecheck` (the `status` field on the `findJobById` mock must match `ProcessingJobRecord` — it does).

- [ ] **Step 5: Commit the skeleton**

```bash
git add apps/photo-service/src/photo/photo.service.spec.ts
git commit -m "skeleton(opm): crash-recovery RED + winner-gate guard"
```

---

### Task 3: 42b/1m8 — cluster save_tree idempotent + `applied` signal

**Files:**
- Test: `apps/cluster-service/tests/test_store.py` (modify — RED 42b distinct-trees + 1m8 missing/`.get()`)
- Test: `apps/cluster-service/tests/test_worker.py` (modify — RED 1m8 non-pending → no SUCCEEDED/usage)
- Modify (GREEN, not skeleton): `store.py` (Protocol + `InMemoryStore.save_tree -> bool`, `.get()`), `store_postgres.py` (`save_tree -> bool`, `SELECT 1 FROM cluster_nodes`; `# pragma: no cover`), `worker.py:_process` (`if not applied: return`).

**Interfaces:**
- Consumes: existing `Store`, `InMemoryStore`, `ClusterWorker`, `ClusterTree`/`TreeNode` model, fixture `_tree()` in the tests.
- Produces: `Store.save_tree(...) -> bool` (True ⇒ tree persisted for a live result; worker publishes SUCCEEDED + usage only when True).

**GREEN obligation (for the implementer):** make `save_tree` return `bool`, idempotent by node existence, `.get()` for a missing row; gate the worker's SUCCEEDED+usage on `applied`. Keep `store_postgres.py` `# pragma: no cover`.

- [ ] **Step 1: Write the RED tests** — add to `apps/cluster-service/tests/test_store.py`

```python
def test_save_tree_is_idempotent_across_redelivery_with_a_distinct_tree():
    # why (42b): a redelivery-while-pending recomputes a DIFFERENT tree (fresh ids);
    # the second save must NOT overwrite/duplicate — the first tree wins. (Must use a
    # DISTINCT second tree — reusing the same one is a vacuous pass.)
    store = InMemoryStore()
    store.create_pending(result_id="r1", user_id="u1", method="time_only", params_json="{}", scope="all")
    first = _tree(root_id="root-A")
    second = _tree(root_id="root-B")  # fresh ids, as the real worker recomputes
    store.save_tree(result_id="r1", tree=first, consumption_json="{}")
    store.save_tree(result_id="r1", tree=second, consumption_json="{}")  # redelivery
    got = store.get(result_id="r1", user_id="u1")
    assert got is not None and got.root is not None
    assert got.root.id == "root-A"  # first tree wins; not overwritten by root-B


def test_save_tree_returns_false_for_missing_or_failed_result():
    # why (1m8): no live pending row to fill → False, so the worker skips SUCCEEDED.
    # Also pins the .get() fix (a missing row must not KeyError, m7).
    store = InMemoryStore()
    assert store.save_tree(result_id="ghost", tree=_tree(), consumption_json="{}") is False
    store.create_pending(result_id="r1", user_id="u1", method="time_only", params_json="{}", scope="all")
    store.mark_failed(result_id="r1", error_message="boom")
    assert store.save_tree(result_id="r1", tree=_tree(), consumption_json="{}") is False
```

- [ ] **Step 2: Write the worker RED test** — add to `apps/cluster-service/tests/test_worker.py`

```python
def test_worker_skips_succeeded_when_save_tree_not_applied():
    # why (1m8): on a non-pending EXISTING result save_tree returns False; the worker
    # must NOT publish SUCCEEDED nor emit usage (currently it publishes regardless →
    # a run with no tree / a phantom SUCCEEDED). NB: use a non-pending result, not a
    # missing one — a missing result KeyErrors → FAILED, a false-GREEN.
    store = InMemoryStore()
    store.create_pending(result_id="r1", user_id="u1", method="time_only", params_json="{}", scope="all")
    store.mark_failed(result_id="r1", error_message="prior failure")
    publisher = FakePublisher()
    worker = _worker(store=store, publisher=publisher)
    worker.handle(_process_message(result_id="r1", user_id="u1"))
    assert not _any_succeeded(publisher)  # no CLUSTER_OUTCOME_SUCCEEDED on cluster.result
    assert not _any_usage(publisher)      # no usage.events emission
```

- [ ] **Step 3: Run to confirm RED**

Run: `cd apps/cluster-service && .venv/bin/python -m pytest tests/test_store.py -k 'idempotent or missing_or_failed' tests/test_worker.py -k 'skips_succeeded' -q`
Expected: FAIL — `save_tree` currently returns `None` (`None is False` → assert fails) and overwrites `r.root` (root becomes `root-B`); the worker publishes SUCCEEDED unconditionally.

- [ ] **Step 4: (no new stub — behavior change to existing `save_tree`/`_process`)**

The `-> bool` return + idempotency + worker gate are GREEN. Typecheck: `make lint-cluster` stays clean (the tests assert observable behavior, not internal types).

- [ ] **Step 5: Commit the skeleton**

```bash
git add apps/cluster-service/tests/test_store.py apps/cluster-service/tests/test_worker.py
git commit -m "skeleton(42b/1m8): idempotent save_tree + applied-gate RED"
```

> Implementer note: `_tree(root_id=...)` must accept an override so two DISTINCT
> trees can be built; extend the existing fixture if it hard-codes ids.
> `FakePublisher`/`_worker`/`_process_message`/`_any_succeeded`/`_any_usage` reuse the
> existing `test_worker.py` doubles (a publisher recording `(dest, BusMessage)` and
> decoders for the result outcome / usage dest).

---

### Task 4: Demo seed — idempotent seed + shared helper lib

**Files:**
- Test: `scripts/smoke-seed.sh` (new — the seed's own dqb smoke: run twice, assert identical slug + reachable public page)
- Stub: `scripts/seed-demo.sh` (new — not-yet-implemented: exits non-zero)
- Modify: `Makefile` (add `.PHONY` + `seed-demo` / `smoke-seed` targets)
- Modify (GREEN, not skeleton): `scripts/lib/photoops-e2e.sh` (new — extract helpers), `scripts/smoke-publication.sh` (source the lib), `scripts/seed-demo.sh` (full idempotent seed).

**Interfaces:**
- Consumes: existing publication smoke flow (signup/login/upload/cluster/create-post/publish), `GET /v1/posts` (title+status), `GET /v1/posts/:id` (slug), `POST /auth/login`.
- Produces: `scripts/seed-demo.sh` prints the published slug + public URL and exits 0 idempotently; `make seed-demo`, `make smoke-seed`.

**GREEN obligation (for the implementer):** extract globals-dependent helpers into `scripts/lib/photoops-e2e.sh`, refactor `smoke-publication.sh` to source it (assertions unchanged), implement the idempotent `seed-demo.sh` (login-else-signup demo user; fixed-title marker → reuse slug via getPost; else build→publish). `make smoke-seed` green (idempotent re-run → same slug).

- [ ] **Step 1: Write the RED smoke** — `scripts/smoke-seed.sh`

```bash
#!/usr/bin/env bash
# RED until seed-demo.sh is implemented. dqb: the seed crosses HTTP↔gRPC↔DB↔MinIO;
# idempotency (same slug on re-run) is the invariant under test.
set -euo pipefail

SEED="$(dirname "$0")/seed-demo.sh"

SLUG1="$("$SEED" | sed -n 's/^SLUG=//p')"
SLUG2="$("$SEED" | sed -n 's/^SLUG=//p')"   # re-run must be idempotent

[ -n "$SLUG1" ] || { echo "ERROR: seed-demo.sh printed no SLUG= line" >&2; exit 1; }
[ "$SLUG1" = "$SLUG2" ] \
  || { echo "ASSERTION FAILED: slug not stable across runs ($SLUG1 != $SLUG2)" >&2; exit 1; }

WEB_BASE_URL="${WEB_BASE_URL:-http://localhost:3000}"
code="$(curl -s -o /dev/null -w '%{http_code}' "$WEB_BASE_URL/posts/$SLUG1")"
[ "$code" = "200" ] \
  || { echo "ASSERTION FAILED: public page /posts/$SLUG1 returned $code (expected 200)" >&2; exit 1; }
echo "[smoke-seed] OK slug=$SLUG1"
```

- [ ] **Step 2: Write the stub seed + Makefile targets**

`scripts/seed-demo.sh`:
```bash
#!/usr/bin/env bash
# STUB — GREEN is the implementer's job. Must end by printing: SLUG=<published-slug>
set -euo pipefail
echo "seed-demo.sh not implemented" >&2
exit 1
```

`Makefile` (add targets; append `seed-demo smoke-seed` to `.PHONY`):
```makefile
seed-demo: ## Idempotently seed the demo dataset (prints SLUG=)
	./scripts/seed-demo.sh

smoke-seed: ## Live seed smoke: run twice, assert identical slug + reachable public page
	./scripts/smoke-seed.sh
```

- [ ] **Step 3: Run to confirm RED**

Run: `chmod +x scripts/seed-demo.sh scripts/smoke-seed.sh && make smoke-seed`
Expected: FAIL — the stub `seed-demo.sh` exits 1 / prints no `SLUG=`, so `smoke-seed` errors on the empty slug.

- [ ] **Step 4: (bash — no typecheck; confirm RED reason is the stub, not a syntax error)**

Run: `bash -n scripts/smoke-seed.sh scripts/seed-demo.sh` (syntax OK) then `make smoke-seed` (Expected: FAIL on "printed no SLUG= line").

- [ ] **Step 5: Commit the skeleton**

```bash
git add scripts/smoke-seed.sh scripts/seed-demo.sh Makefile
git commit -m "skeleton(seed): idempotent-seed smoke (RED) + stub"
```

---

## Skeleton Self-Review

- **Obligation coverage:** 0od transient-vs-permanent + bounded-retry → `test_errors.py` + handler REDs ✓; opm strand + winner-clobber → crash-recovery RED + guard ✓; 42b duplicate-root → distinct-trees RED ✓; 1m8 phantom-SUCCEEDED → non-pending worker RED ✓; seed idempotency → `smoke-seed.sh` ✓. Smoke additions (0od permanent, seed) are live-boundary obligations noted per task.
- **No GREEN:** stubs raise `NotImplementedError` / exit 1; the two bugfix tasks (opm, 42b/1m8) carry RED tests against existing code with no new production stub — the behavior change is the implementer's.
- **Type consistency:** `classify_storage_error`/`requeue_on`/`retry_attempt`/`should_retry`/`MAX_RETRY_ATTEMPTS` names match across Task 1 stub + tests; `save_tree -> bool` name matches Task 3 test + interface.
- **Reviewable size:** ~6 focused RED tests + 2 new pure stub modules + 1 stub script + Makefile/target diff — reviewable without reading an implementation.
- **Coverage note:** the new pure stubs (Task 1) are exercised by `test_errors.py`; `make skeleton-gate` must pass before human review (a stub line uncovered ⇒ add the missing RED).
```
