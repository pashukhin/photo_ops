# Session 021: Pipeline integrity hardening + demo seed

Status: **Draft (заготовка).** Not yet brainstormed. Scope below is a proposal to
refine at session start. A reliability slice for the media/cluster pipeline the
demo relies on, plus the reproducible **demo seed script** deferred from 020. The
publication vertical is already built (017–020); this is the first forward session
after 020. **Sequenced before** the P1 release-readiness sessions (023–024) and the
later, release-quality demo recording (which gates on `9q4.1`–`9q4.4`).

> Human-readable scoping summary. Accepted design + plan land at session start
> under `docs/superpowers/specs` & `plans` (exSDD). Does not restate design
> (Principle 7).

## Goal

> Close the P2 integrity bugs so a photo cannot silently get stuck or be
> permanently failed by a transient hiccup, and a redelivered cluster job cannot
> corrupt a result; and script the demo dataset so 023+ verification and the demo
> recording are reproducible. Reliability + repeatability, not features — but the
> demo leans on both.

## Proposed scope (refine at session start)

- **`photo_ops-0od`** — media-worker turns transient MinIO/S3 errors into a
  permanent `FAILED` then acks. Classify transient vs permanent; retry/redeliver
  transient, only `FAILED` on genuinely permanent (corrupt/unsupported) input.
- **`photo_ops-opm`** — `finalizeResult` is non-atomic: a crash after
  `finalizeJob` but before `setStatus('ready')` strands the photo in `processing`.
  Apply variants + attributes + status in one transaction, or make finalize
  idempotent so redelivery re-applies the terminal state.
- **`photo_ops-42b`** (+ **`1m8`**) — cluster `save_tree` guards only on
  `pending` with fresh uuid7 node ids; a redelivery before the run flips to
  `ready` inserts a second root → corrupted tree. Make `save_tree` idempotent
  (skip if nodes exist, or key node ids deterministically off `result_id`+path).
- **Demo seed script** — turn `docs/demo-runbook.md` into a reproducible,
  idempotent `scripts/seed-demo.sh` (deferred from 020): ensure `demo@photoops.local`
  exists with a small photo set → a ready cluster → a published post with a stable
  slug, reusing the `smoke-publication.sh` upload/cluster helpers. So the demo
  dataset (and 023+ manual checks) are one command, not manual clicking.

## Out of scope

New product features; consumer reconnect/supervision (`photo_ops-03x`, `di8`);
usage pricing units. PNG-alpha / orientation cosmetic bugs (#8, #10) unless cheap.

## Method (exSDD)

RED test reproducing each stuck/duplicate/corruption path → minimal GREEN. Each
bug crosses a boundary (storage / DB / AMQP) → the matching live `make smoke-*`
(dqb). The seed script is exercised by running it against the live stack (its own
smoke: idempotent re-run yields the same published slug).

## Depends on

- The integrity bugs are independent of the publication vertical (runnable any time
  after 016). The seed script depends on the shipped publish flow (019/020).
  Recommended slot: **first forward session after 020**, before the geo/feature work.

## Verification bar

Unit for each fix (transient-retry, atomic/idempotent finalize, idempotent
save_tree); live `make smoke-media` + `make smoke-cluster` (+ `scripts/seed-demo.sh`
run green, idempotent); `make gate` + `make coverage-gate` + `make test-guard`;
final `/code-review`.

## References

- Filed from the deep-review pass: `0od`, `opm`, `42b` (P2); sibling `1m8`.
- Demo seed deferred from 020: `docs/demo-runbook.md`; roadmap `docs/roadmap.md`.
- Method + gate tier: `docs/agent-workflow-evolution.md` (Decisions 1, 7).
