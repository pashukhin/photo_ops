# Session 021: Pipeline integrity hardening (P2 bugs)

Status: **Draft (заготовка).** Not yet brainstormed. Scope below is a proposal to
refine at session start. Reliability slice for the media/cluster pipeline the demo
relies on. **Sequence before recording the final demo** (session 020), after the
publication vertical is built.

> Human-readable scoping summary. Accepted design + plan land at session start
> under `docs/superpowers/specs` & `plans` (exSDD). Does not restate design
> (Principle 7).

## Goal

> Close the three P2 integrity bugs so a photo cannot silently get stuck or be
> permanently failed by a transient hiccup, and a redelivered cluster job cannot
> corrupt a result. These are reliability, not features — but the demo leans on
> this pipeline.

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

## Out of scope

New features; consumer reconnect/supervision (`photo_ops-03x`, `di8`);
usage pricing units. PNG-alpha / orientation cosmetic bugs (#8, #10) unless cheap.

## Method (exSDD)

RED test reproducing each stuck/duplicate/corruption path → minimal GREEN. Each
bug crosses a boundary (storage / DB / AMQP) → the matching live `make smoke-*`
(dqb).

## Depends on

- Independent of the publication vertical; can run any time after 016. Recommended
  slot: after 019, before the 020 demo recording.

## Verification bar

Unit for each fix (transient-retry, atomic/idempotent finalize, idempotent
save_tree); live `make smoke-media` + `make smoke-cluster`; `make gate` +
`make coverage-gate` + `make test-guard`; final `/code-review`.

## References

- Filed from the deep-review pass: `0od`, `opm`, `42b` (P2); sibling `1m8`.
- Method + gate tier: `docs/agent-workflow-evolution.md` (Decisions 1, 7).
