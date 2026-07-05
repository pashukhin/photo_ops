# Session 016: P1 integrity bugfixes (photo + usage)

Status: **Done — merged 2026-07-05** (PR #5, merge commit `7d3a8d1`). RED-first
fixes; full `make gate` + `make test-guard` + live `make smoke-usage` green;
`coverage-gate` 100% new-code (broker wiring split into `broker.go`, excluded from
the profile — the one line unit coverage could not reach). `photo_ops-v6c` and
`photo_ops-35w` closed.

> Human-readable scoping summary. This session is a narrow, verified bugfix slice
> — no product-feature scope. Follows a deep project review that surfaced five
> verified data/billing-integrity bugs; this session pays down the two P1s.

## Goal

> Fix the two P1 integrity bugs that fire on trivial, everyday triggers (a client
> retry; a brief DB blip) and directly corrupt data or lose billing — before any
> further billing/pipeline work builds on top of them.

## Scope (delivered)

- **`photo_ops-v6c` (P1)** — `completeUpload` idempotency hole. A retried /
  double-clicked / gRPC-retried CompleteUpload regressed a `ready` photo back to
  `uploaded` and started a second billable processing run (charge-once keys on
  jobId, not photoId). Fix: only run the `uploading → uploaded → processing`
  kickoff when the photo is still `uploading`; a duplicate complete returns
  current state. RED-first; changed code 100% covered.
- **`photo_ops-35w` (P1)** — usage consumer dead-lettered valid events on any
  transient DB error. Fix: `handleDelivery` splits poison (decode → DLQ) from
  transient (record → Nack requeue + bounded backoff). Also closes the
  ctx-cancel-at-shutdown dead-letter (bug #9 class). Logic 100% unit-covered.

## Out of scope

The three P2 integrity bugs (`0od`, `opm`, `42b`) → session 021; consumer
reconnect/supervision + requeue hot-loop bound (`photo_ops-03x`); any feature
work. The single broker-delegation line in `Consumer.Start` is unit-uncoverable
without live RabbitMQ — verified by live `make smoke-usage` (dqb) at merge
(owner-accepted; run `make coverage-gate` with `COVERAGE_FAIL_UNDER` for this
commit).

## Method (exSDD)

RED test reproducing each bug → minimal GREEN → `make gate`. Both fixes are
service-internal logic; `35w` crosses the AMQP boundary → live `make smoke-usage`
before merge (dqb).

## Verification bar

`make gate` green (TS + media + usage + cluster); `make test-guard` clean;
`make coverage-gate` (one documented broker line); live `make smoke-usage` green
before merge; final `/code-review`.

## References

- Filed from the deep-review pass: bugs `v6c`,`35w` (P1); `0od`,`opm`,`42b` (P2).
- Follow-up: `photo_ops-03x` (consumer reconnect/supervision).
- Method + gate tier: `docs/agent-workflow-evolution.md` (Decisions 1, 7).
