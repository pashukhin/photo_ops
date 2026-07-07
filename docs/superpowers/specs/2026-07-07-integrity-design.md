# Session 021 — Pipeline integrity hardening + demo seed (design)

Date: 2026-07-07
Status: **Accepted design** (brainstormed + adversarially reviewed; forks settled)
Method: exSDD (RED reproducing each failure → minimal GREEN + live `make smoke-*`)

Bugs: `photo_ops-0od` (media transient→FAILED), `photo_ops-opm` (finalize
non-atomic strand), `photo_ops-42b` + `photo_ops-1m8` (cluster save_tree
redelivery corruption / missing-tree). Seed: `photo_ops-pht` (demo seed script).
Residual filed: `photo_ops-55s` (result-consumer DLQ-strand — out of scope, §6).

This spec records only the design decisions and their rationale. It does not
restate the domain model (`docs/domain-model.md`) or broker topology
(service `CLAUDE.md`s) — Principle 7 (no duplicate truth).

## 0. Goal

A photo cannot silently get stuck in `processing` or be permanently `FAILED` by a
transient hiccup, and a redelivered cluster job cannot corrupt a result; plus a
reproducible one-command demo seed. Reliability + repeatability, not features.

The four forks were settled at brainstorm, then an adversarial code review
reopened two of them (M1, M5) and refined the rest; the decisions below are
post-review.

---

## 1. `photo_ops-0od` — media-worker: classify transient vs permanent, bounded retry

### Failure today
`handler.py:_handle` wraps `_process` in a blanket `except Exception`, publishes a
permanent `PROCESSING_OUTCOME_FAILED`, and returns normally → `rabbitmq.py`
`_on_message` acks. A transient MinIO/S3 error (503, connection reset) is thus
turned into a permanent `FAILED` with no redelivery, defeating the idempotent
claim-check.

### Design
Three exception buckets:

- **Transient → retry, never FAILED.** Storage unreachable / throttled / 5xx /
  mid-read disconnect. Concretely (verified against `minio` 7.2.20):
  - `urllib3.exceptions.HTTPError` (base of `MaxRetryError`, `NewConnectionError`,
    `ProtocolError`, timeouts) — connection-down is the **headline** transient and
    is NOT an `S3Error`.
  - `minio.error.ServerError` with `status_code >= 500` (5xx without an XML body;
    base is `MinioException`, NOT `S3Error`).
  - `minio.error.S3Error` with a transient **code allow-list**:
    `SlowDown`, `RequestTimeout`, `ServiceUnavailable`, `InternalError`, and any
    `5xx`.
- **Permanent → publish FAILED + ack.** Genuinely bad input: image decode /
  unsupported (`PIL.UnidentifiedImageError`, truncated-image `OSError`),
  `S3Error` `NoSuchKey` on download (original genuinely absent — retry won't help),
  malformed job body (already handled at `handler.py:49-67`).
- **Unexpected → DLQ (unchanged).** Programming errors / OOM escape to the
  consumer's `nack(requeue=False)` → DLQ, exactly as today.

**Mechanism (bounded, no callback stall):**

- New `media_worker/errors.py`: `class TransientProcessingError(Exception)`.
- A pure classifier `classify_storage_error(exc) -> bool` (transient?) in a small
  module (e.g. `storage.py` or `errors.py`), unit-tested directly against the
  real exception TYPES above. `MinioObjectStore.download/upload` catch storage
  exceptions and re-raise `TransientProcessingError` when `classify_storage_error`
  is true; permanent storage errors and image-decode errors propagate as-is.
- `handler.py:_handle`: the `except Exception` around `_process` must **not** catch
  `TransientProcessingError` (let it propagate — no FAILED published); it still
  catches the rest → publishes FAILED (permanent/expected). Order: `except
  TransientProcessingError: raise` before the generic handler, or catch generic and
  re-raise transient.
- `rabbitmq.py:_on_message`: bounded retry with **no `time.sleep` in the pika
  callback** (a sleep would block the single `BlockingConnection`, prefetch=1 →
  head-of-line stall + heartbeat risk):
  - On `TransientProcessingError`: read an attempt counter from a stamped header
    (`x-attempt`, default 0); if `attempt < MAX_ATTEMPTS` (default 5), **republish**
    the job to `photo.process` with `x-attempt = attempt+1` and `basic_ack` the
    original (immediate redelivery, bounded, no topology change); if
    `attempt >= MAX_ATTEMPTS`, publish `FAILED` (give up) + ack.
  - On any other exception: `nack(requeue=False)` → DLQ (unchanged).
  - A pure `requeue_on(exc) -> bool = isinstance(exc, TransientProcessingError)`
    and the attempt-counter arithmetic live in unit-tested helpers; the thin pika
    `basic_publish`/`basic_ack`/`basic_nack` wiring is `# pragma: no cover`.

Rationale for bounded (not unbounded requeue): unbounded native requeue on a
classic queue is not count-bounded and bypasses the DLX; a misclassified-permanent
or a sustained outage would loop forever, wedging the whole queue (prefetch=1) with
the photo stuck in `processing` and no visible failure. Bounded-immediate retry
recovers brief blips; a sustained outage fails the photo after N attempts (a
`reprocess` job can re-drive it once storage is back). A backoff/delay queue is
deferred — the topology is canonical/mirrored and changing it is cross-cutting.

### Tests
- **Unit RED** (`test_handler.py` / new `test_errors.py`):
  - transient storage error (each of the three types) → `_process`/`_handle`
    raises `TransientProcessingError`, **no** FAILED published.
  - permanent (corrupt image, `NoSuchKey`) → FAILED published, no raise.
  - `classify_storage_error` truth table over the real exception types.
  - `requeue_on` + attempt-counter arithmetic (attempt<N → republish w/ N+1;
    attempt>=N → FAILED).
- **Coverage (M4):** media-worker runs `--cov=src/media_worker` with **no omit
  list**; `MinioObjectStore`/`RabbitMqBus` are not unit-instantiated. The new
  classification/counter LOGIC is covered as pure functions; the storage
  except-body IO and `_on_message` pika wiring get `# pragma: no cover` (matches
  cluster-service's convention).
- **Live smoke** (`make smoke-media`): happy path (regression) + a **permanent**
  case (upload a non-image / corrupt object → assert the photo reaches `failed`),
  which exercises the permanent branch on the live stack. Transient is not
  injected live (hard to force a real 503 mid-flight) — covered by unit; noted.

---

## 2. `photo_ops-opm` — photo-service: idempotent re-apply + winner-gate

### Failure today
`finalizeResult` (`photo.service.ts:209-256`): `finalizeJob(jobId,outcome)` (guarded
`status='queued'`) commits, then `upsertVariant`/`applyAttributes`/`setStatus`
run as separate statements. A crash after the job commit but before
`setStatus('ready')` → redelivery finds the job no longer `queued` →
`finalizeJob` returns false → early `return` at L211 → variants/attributes/status
never applied → photo stuck in `processing` forever.

### Design — idempotent re-apply, gated on the recorded winner
All terminal writes are idempotent (`upsertVariant` = `onConflictDoUpdate`,
`applyAttributes`/`setStatus` = `set`). Restructure `finalizeResult`:

```
await repo.finalizeJob(jobId, outcome, errorMessage);   // idempotent winner-claim
const job = await repo.findJobById(jobId);
if (!job || job.status !== outcome) return;             // unknown OR losing duplicate → no-op
if (outcome === 'succeeded') {
  for (v of variants) upsertVariant(v);                 // idempotent
  applyAttributes(...);                                 // idempotent
  setStatus(photoId, 'ready');                          // idempotent
  emitProcessingConsumption(...);                       // ALWAYS (best-effort); charge-once via jobId dedup
} else {
  setStatus(photoId, 'failed');                         // idempotent
}
```

**Winner-gate (M1 — the review-critical amendment).** The naive "on `failed` →
`setStatus('failed')` always" lets a **losing** opposite-outcome duplicate
overwrite the winner: SUCCEEDED wins (photo `ready` + variants) → a redelivery
takes the claim path and the EXIF re-download at `handler.py:154` fails → a FAILED
is published → the good photo becomes `failed`. Gating the terminal apply on
`job.status === outcome` (the recorded winner from `finalizeJob`) makes a losing
duplicate a no-op while a same-outcome redelivery re-applies idempotently and
reaches the terminal state. This closes the opm strand **and** prevents the new
winner-clobber.

**Usage always-emitted (m6).** Usage is already charge-once: the emitter keys
`idempotencyKey = jobId` and usage-service dedups via `INSERT … ON CONFLICT DO
NOTHING`. The old `applied`-gate did not provide charge-once (dedup does) and
created a lost-charge hole (crash after apply, before emit → redelivery has
`applied=false` → emit skipped forever). Always emit and lean on dedup.

### Tests
- **Unit RED** (`photo.service.spec.ts`):
  - crash-recovery: `finalizeJob` returns false but `job.status='succeeded'`
    (same outcome) → variants+attrs+`setStatus('ready')` ARE applied (currently
    early-returns → nothing applied → RED).
  - winner-clobber (M1): `finalizeJob` false, `job.status='succeeded'`, incoming
    `outcome='failed'` → `setStatus('failed')` is NOT called (loser ignored).
  - genuine duplicate SUCCEEDED (same outcome) → idempotent re-apply; usage
    emitted (deduped downstream), not double-counted at the service.
- **test-guard (m8):** the existing test titled *"finalize is idempotent:
  duplicate result (finalizeJob=false) writes nothing"* (`photo.service.spec.ts:382`)
  asserts the OLD behavior and its title becomes a lie. **Rename** it to an accurate
  title and add an `Allow-test-removal: <reason>` trailer on that commit (keeping
  the lying title, or renaming without the trailer, both fail the guard).
- **Live smoke** (`make smoke-media`): happy path reaches `ready` (regression); the
  crash-window is not live-injectable — covered by the unit RED.
- **Residual (M3 → `photo_ops-55s`, out of scope):** a transient DB fault *inside*
  finalize makes the result consumer `nack(requeue=false)` → DLQ → no redelivery →
  strand. Neither idempotent re-apply nor a single transaction fixes this (a rejected
  tx also DLQs). Documented as a known limitation; the fix (classify + requeue
  transient finalize faults, parallel to 0od) is filed separately.

---

## 3. `photo_ops-42b` + `photo_ops-1m8` — cluster save_tree idempotent + `applied` signal

### Failure today
`store_postgres.py:save_tree` (L30-42) guards only on `status='pending'` and does
NOT flip status (the server's `ResultConsumer` flips it on a separate
`cluster.result` message). The worker recomputes the tree with **fresh uuid7 node
ids** each run. A `cluster.process` redelivery any time before the flip sees
`pending` again → `_insert_node` runs a second time → two `parent_id IS NULL` roots
under one `result_id` → `_build_tree` picks one and orphans the other → corrupted
result. Sibling `1m8`: when the guard finds no pending row, `save_tree` silently
returns yet the worker still publishes SUCCEEDED + emits usage → a run with no tree.

### Design — `save_tree(...) -> bool` (applied), skip-if-exists
Return a single boolean `applied`; make insertion idempotent by node existence.

`Store.save_tree` signature → `-> bool`. Logic (both adapters):

```
row = SELECT status FROM clustering_results WHERE id=%s FOR UPDATE   # (InMemory: .get())
if row is None or row.status == 'failed': return False               # 1m8: nothing live to fill
if nodes already exist for result_id (SELECT 1 / InMemory root is not None):
    return True                                                      # 42b: idempotent — DO NOT re-insert
update result aggregates; _insert_node(root); return True
```

`worker.py:_process`:

```
applied = self._store.save_tree(...)
if not applied:
    log; return                       # 1m8: skip usage + SUCCEEDED
emit usage; publish SUCCEEDED
```

**Why "nodes exist → True" (not False).** `applied` means "the tree is persisted
for a live (non-failed) result," not "I inserted just now." Returning True when
nodes already exist lets the worker re-publish SUCCEEDED (idempotent `mark_ready`)
and re-emit usage (deduped by `result_id`), which **drives the flip** if the first
SUCCEEDED was lost — preserving liveness — while the node-existence guard prevents
the second root. Double compute/usage on redelivery is wasted but safe.

**FOR UPDATE reasoning.** Because `save_tree` never flips status, the row lock alone
does not serialize sequential redeliveries (the lock releases at commit; a later
redelivery re-acquires and still sees `pending`). The **node-existence check inside
the locked transaction** is what makes it idempotent for both concurrent (lock
serializes, second sees nodes) and sequential (second sees nodes) redelivery.

### Tests
- **Unit RED** (`test_store.py`, against `InMemoryStore` — the logic tier):
  - 42b: `save_tree` twice while `pending` → second returns True and the result
    still has exactly one root / unchanged node set (currently re-inserts).
  - 1m8: `save_tree` on a missing result → False (must use `.get()` — the current
    `self._results[result_id]` would `KeyError`, m7); on a `failed` result → False.
  - worker: `applied=False` → no SUCCEEDED and no usage published; `applied=True`
    → both published.
- **Coverage:** `store_postgres.py` is omit-listed + `# pragma: no cover` (thin IO,
  smoke-verified) — the Postgres branch mirror stays uncovered by design; the
  `applied` semantics are unit-covered via `InMemoryStore`. The concurrent-redelivery
  path is Postgres/lock-specific → smoke-only, flagged as not unit-verified (m7).
- **Live smoke** (`make smoke-cluster`): happy path (regression). Redelivery is not
  live-injectable — covered by the unit RED.

---

## 4. Demo seed — full, idempotent, shared helper lib

### Design
Turn `docs/demo-runbook.md` into a reproducible, idempotent seed reusing the
existing publication smoke flow.

- **New `scripts/lib/photoops-e2e.sh`** — sourced helper library extracted from
  `scripts/smoke-publication.sh`: `gen_jpeg`, `upload_photo`, `wait_photo_ready`,
  `generate_cluster`, `wait_cluster_ready`, `create_post`, `publish_post`, plus
  `signup` / `login`. **Pure helpers only** — `set -euo pipefail`, `trap 'rm -rf'
  EXIT`, and the unique-per-run signup stay in the **top-level** scripts (n11), so
  smoke-publication keeps its isolation/cleanup.
- **Refactor `scripts/smoke-publication.sh`** to `source` the lib (assertions
  unchanged).
- **New `scripts/seed-demo.sh`** — idempotent:
  1. `login demo@photoops.local / demo12345`; on failure `signup` (login is a real
     endpoint — `apps/api-gateway/src/http/auth.controller.ts:21`).
  2. **Idempotency marker (m9):** look for a *published* post owned by demo with the
     fixed seed **title** (a deterministic marker, e.g. `"PhotoOps demo — first
     outing"`). If found → print its slug + public URL and `exit 0`. The slug is an
     opaque random token (`randomBytes`, immutable once set) — stability comes from
     detect-and-reuse, not from re-minting.
  3. Else build: upload a small fixed JPEG set → wait ready → `generate_cluster` →
     wait ready → pick a selectable child node → `create_post` → set title (the
     marker) + body + a caption or two → `publish_post` public → print slug + URL.
  - Partial-seed hole documented: a crash before publish leaves no marker →
    re-run rebuilds (may orphan the earlier photos/cluster). Acceptable for a demo
    seed; convergence is on the published marker.
- **New `scripts/smoke-seed.sh`** + Makefile `seed-demo` / `smoke-seed`: run
  `seed-demo.sh` twice and assert (a) identical slug across runs and (b) the public
  page is reachable logged-out. This is the seed's own dqb smoke (idempotency is the
  invariant under test).

---

## 5. Cross-cutting: gates

- **Coverage-gate:** new/changed LOGIC is unit-covered; thin IO that cannot be
  unit-instantiated (`MinioObjectStore` except-bodies, `_on_message` pika wiring,
  `store_postgres.save_tree`) is `# pragma: no cover` per existing convention and
  smoke-verified. `make skeleton-gate` before human skeleton review;
  `make coverage-gate` before merge.
- **test-guard:** only the opm rename (§2, m8) removes a test declaration → needs an
  `Allow-test-removal:` trailer. Everything else adds tests.
- **Full gate:** `make gate` (TS + media-worker + cluster halves) + live
  `make smoke-media` + `make smoke-cluster` + `make smoke-seed` (idempotent re-run)
  green before final review.

## 6. Out of scope / known limitations

- `photo_ops-55s` (result-consumer DLQ-strand on transient finalize faults) —
  filed, not fixed here.
- Bounded transient retry has no backoff/delay queue (immediate republish, capped at
  N) — a delay queue is deferred (topology is canonical/mirrored).
- Redelivery of a cluster job recomputes the whole tree (wasted compute); a DLQ'd
  SUCCEEDED result is never re-driven (re-SUCCEEDED only recovers on *job*
  redelivery) — m10.
- No new product features; geo / 9q4 release-readiness are 022+.

## 7. Verification bar

Unit RED→GREEN for each fix (transient classify + bounded retry; idempotent
finalize + winner-gate; idempotent save_tree + `applied`); live `make smoke-media`
+ `make smoke-cluster` + `make smoke-seed` (idempotent) green; `make gate` +
`make coverage-gate` + `make test-guard`; final `/code-review`.
