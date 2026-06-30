# ADR 0004 — Usage accounting: append-only raw-unit ledger + read-time pricing

Date: 2026-06-30 · Status: accepted · Session: 012 (`photo_ops-2c2`)

Context: session 012 builds `usage-service`, the cross-cutting usage-accounting
plane (first Go service), implementing ТЗ §3.10. This ADR records only the
durable *why* and the rejected alternatives — the contract lives in
`proto/usage/v1/consumption.proto` + `usage_service.proto`, the schema in
`apps/usage-service/migrations/0001_*.sql`, and the behavior in the Go/TS test
files. Method: executable-spec / skeleton-first SDD (`docs/agent-workflow-evolution.md`).

## Decisions

1. **Emit, not pull.** Operations publish `ConsumptionEvent`s to RabbitMQ
   (`usage.events`); usage-service consumes them. usage-service never reads
   another service's database — DB ownership (`docs/architecture.md`) forbids
   it, and the producing runtime is the only place that cheaply knows its own
   consumption. Mirrors the existing `photo.process`/`photo.result` async
   pattern. *Rejected:* usage-service pulling domain facts from photo-db/cluster-db
   (breaks ownership; couples the billing plane to every domain schema).

2. **The ledger stores RAW provider-independent units + provenance; money is
   resolved at READ.** `billing_events` carries `quantity`/`unit`/`resource_type`
   + `provider` + `occurred_at` and has **no** `unit_price`/`amount`/`currency`
   columns — deviating deliberately from the ТЗ §6 `BillingEvent` field list.
   Why: (a) anti-vendor-lock — the provider is unknown (possibly our own
   hardware), so consumption is recorded in raw units (`byte`, `operation`, later
   `byte_second`/`cpu_second`) and translation to money is a separate layer;
   (b) different services, and even different instances of one service, can run
   on different providers under different tariff grids at different times —
   materializing a price into an immutable append-only row would freeze a
   possibly-wrong early price and make a tariff change require mutating the
   ledger. Cost is therefore `raw ⋈ rate-effective-at(provider, occurred_at)`.
   *Rejected:* materializing money per row (immutable invoice, but freezes price,
   contradicts a replaceable pricing layer); a single read-time price table
   (cannot reconstruct the correct historical cost across providers/time).

3. **Provenance is stamped by the producing instance; pricing knows nothing
   about where things ran.** Each emitting instance stamps `provider` from its
   own config/env (where it physically executed) + `occurred_at`. usage-service
   owns all pricing and resolves a rate from (`provider`, `resource_type`,
   `unit`, `occurred_at`). Clean split: producers report *physical provenance*
   (which they inherently know), the billing plane owns *tariffs*.

4. **Pricing is an extractable internal module.** The `Resolver`
   (`internal/usage`) is the only place money enters; it is designed to be lifted
   into a separate pricing-service later without changing callers or the ledger.
   Session 012 ships a `StaticResolver` (single `local-demo` provider, flat
   rates). *Seams:* versioned / multi-provider rate cards, region/SKU, an
   extracted pricing-service, and a historical price-snapshot.

5. **Charge-once on intake via a `processed_events` inbox.** The producer
   supplies a stable `idempotency_key` per operation (media `job_id`,
   `original:{photo_id}`, cluster `result_id`); intake inserts it
   `ON CONFLICT DO NOTHING` in the same transaction as the ledger rows, so a
   redelivery/replay over the at-least-once broker writes nothing — exactly-once
   accounting, append-only ledger.

6. **Storage is recorded as a bytes level now; the byte_seconds integral is a
   seam.** photo-service emits a one-shot bytes event when an original/variant is
   stored; current usage = Σ stored (no deletes yet → monotonic, fine for demo)
   and the monthly estimate applies a $/GB·month rate to current bytes. The true
   memory/storage-over-time integral (`byte_seconds`) is a future
   storage-reconciler (§5 Go shell). *Rejected:* a periodic byte_seconds
   reconciler now (needs a scheduler before there is anything to integrate).

## Non-goals (seams)

Real payments / Stripe / invoices / subscriptions / taxes (ТЗ §3.10 explicitly);
materialized money + price snapshots; versioned/multi-provider rate cards;
extracted pricing-service; byte_seconds storage-reconciler; soft-delete of stored
bytes; cluster/post consumption events (s013 / publication emit into this same
contract); web usage dashboard UI.
