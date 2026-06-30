# Usage Accounting (Go usage-service) Skeleton Commit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to fill this skeleton task-by-task — each task makes its RED tests green within the provided stubs. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `usage-service` (first Go service): ingest `ConsumptionEvent`s from RabbitMQ into an append-only, charge-once ledger of raw provider-independent units, and serve a per-user usage summary (with a read-time cost estimate) over gRPC through the gateway; photo-service emits the first real consumption events.

**Architecture / WHY:** Emit-not-pull (services publish raw consumption + provenance; usage-service owns the ledger and all pricing). Append-only ledger, money resolved at read, charge-once via an inbox. Entry points — contract → `proto/usage/v1/consumption.proto` + `usage_service.proto`; schema → `apps/usage-service/migrations/0001_create_usage_tables.sql`; core interfaces/stubs → `apps/usage-service/internal/usage/*.go`; producer → `apps/photo-service/src/photo/usage.emitter.ts`; behavior → the `*_test.go` + `usage.emitter.spec.ts` files. Durable why/rejected-alternatives → `docs/adr/0004-usage-accounting-ledger.md`; scenario → `docs/e2e-usage-accounting.md`.

**Tech Stack:** Go 1.23 (pgx/pgxpool, amqp091-go, google.golang.org/grpc, buf-generated proto); TS (NestJS photo-service producer, protobufjs runtime codec); Postgres `usage-db`; RabbitMQ.

## Global Constraints

- usage-service owns and connects only to `usage-db`; cross-service refs are UUID v7 with no FK.
- `billing_events` is append-only — never UPDATE/DELETE. No `unit_price`/`amount`/`currency` columns (money resolved at read). See ADR-0004.
- Charge-once: `processed_events` inbox, `INSERT … ON CONFLICT DO NOTHING` in the same tx as the ledger rows.
- Broker topology mirrors the canonical media-path layout (durable direct exchange + DLX/DLQ); the TS publisher and Go consumer must declare identical topology for `usage.events`.
- Producers emit RAW units + `provider` provenance only; never money.
- `make gate` (incl. `gate-usage`) green before push; final `/code-review` (architecture-sensitive: new bounded context + DB + cross-service async contract + sync RPC + new language).

## Non-Goals

Real payments/Stripe/invoices/subscriptions/taxes; materialized money + price snapshots; versioned/multi-provider rate cards; extracted pricing-service; `byte_seconds` storage-reconciler; soft-delete of stored bytes; cluster/post consumption events (s013/publication emit into this same contract); web usage dashboard UI. (Enforced by ADR-0004 + the absence of the corresponding columns/methods.)

---

### Task 1: Go core — `internal/usage` (fill RED green)

**Files:** `apps/usage-service/internal/usage/{event,pricing,ledger,summary,reader}.go` (+ their `_test.go`, already RED).

**GREEN obligation:** make the existing RED tests pass within the stubs — do not weaken/rename them.
- [ ] `Explode` — one BillingRow per Measurement, each inheriting event user/provider/occurred_at.
- [ ] `StaticResolver.Resolve` — flat `local-demo` rates for known (resource,unit); `ok=false` for unknown.
- [ ] `Ledger.Record` — `Explode` → `store.RecordOnce(key, rows)`; return `recorded`.
- [ ] `BuildSummary` — pass raw lines through; estimate monthly cost via Resolver; zero usage → "0.00".
- [ ] `Reader.SummaryForUser` — `store.SumByResource` → `BuildSummary`.
- [ ] Run `make test-usage` → all green; `make vet-usage` clean.
- [ ] Commit.

### Task 2: Go proto codegen + deps

**Files:** `proto/buf.gen.go.yaml` (new), `proto` make script + `proto-check` (extend), `apps/usage-service/go.{mod,sum}`.

- [ ] Add `buf.gen.go.yaml` (protocolbuffers/go + grpc/go) generating usage/v1 + common/v1 into `apps/usage-service/internal/pb` (committed); managed `go_package_prefix` = module path.
- [ ] Extend `make proto` to run it and `make proto-check` to drift-check `apps/usage-service/internal/pb`.
- [ ] `go get` pgx/pgxpool, amqp091-go, google.golang.org/grpc, protobuf runtime; `go mod tidy`.
- [ ] Run `make proto-check` + `go build ./...` → green. Commit.

### Task 3: pg `Store` adapter (`internal/store`)

**Files:** `apps/usage-service/internal/store/postgres.go`; component test against the live stack.

**Interfaces:** implements `usage.Store` (compile-pin already present).
- [ ] `RecordOnce` — one tx: `INSERT processed_events … ON CONFLICT DO NOTHING`; iff inserted, `INSERT billing_events` rows (uuid v7 ids); return `recorded`.
- [ ] `SumByResource` — `SELECT event_type, resource_type, SUM(quantity), unit … WHERE user_id=$1 GROUP BY …`.
- [ ] Component test (smoke-stack): append-only + replay-no-dup against real Postgres. Commit.

### Task 4: AMQP consumer (`internal/amqp`)

**Files:** `apps/usage-service/internal/amqp/consumer.go`.
- [ ] `Decode` — generated-proto decode of the `usage.events` body → `usage.ConsumptionEvent` (parse `occurred_at`).
- [ ] `Consumer.Start` — declare canonical topology for `usage.events`; consume → `Recorder.Record`; ack (replay is harmless).
- [ ] Component test (fake/real broker): event → ledger row; redelivery no-dup. Commit.

### Task 5: gRPC server (`internal/grpcserver`) + wiring (`cmd`)

**Files:** `apps/usage-service/internal/grpcserver/server.go`, `apps/usage-service/cmd/usage-service/main.go`.
- [ ] `Server` embeds generated `UnimplementedUsageServiceServer`; `GetUsageSummary` maps proto req `user_id` → `reader.SummaryForUser` → proto resp (lines + estimate + currency); `Health`.
- [ ] `main` — load config (DATABASE_URL, RABBITMQ_URL, GRPC_PORT, `USAGE_PROVIDER` default `local-demo`); wire pgxpool → store → ledger/reader; start consumer goroutine; serve gRPC. Commit.

### Task 6: photo-service emitter — fill green + integrate (2 points)

**Files:** `apps/photo-service/src/photo/usage.{codec,emitter}.ts` (RED specs present); `photo.service.ts` (CompleteUpload), `processing.consumer.ts`/service finalize (result success); `app.module.ts` wiring.
- [ ] `encodeConsumptionEvent` + `UsageEmitter.emit*` → make `usage.emitter.spec.ts` green.
- [ ] Call `emitOriginalStored` after CompleteUpload success; `emitProcessingConsumption` after a SUCCEEDED finalize only; bind `provider` from env; publish via the shared bus to `usage.events`.
- [ ] Integration test: emit on success, no emit on failure. `make test-photo` green. Commit.

### Task 7: gateway route + golangci-lint + smoke + docs

**Files:** `apps/api-gateway/src/**` (usage route), `Makefile`/CI (`golangci-lint` into `gate-usage` + CI), `scripts/smoke-usage.sh`, `docs/domain-model.md`, `docs/architecture.md`.
- [ ] Gateway: authed `GET /v1/usage/summary` → gRPC `GetUsageSummary(user_id = session user)`; mirror identity/photo proxy.
- [ ] Add `golangci-lint run` to `gate-usage` recipe + the CI usage-service job (bodies now real).
- [ ] `make smoke-usage` realizing `docs/e2e-usage-accounting.md`.
- [ ] Update `docs/domain-model.md` (BillingEvent: `provider`, no money cols, owner usage-service implemented) + `docs/architecture.md` (usage-service bounded context, `usage.events` async contract). Commit.

### Task 8: whole-branch verification

- [ ] `make gate` green (TS + media-worker + usage-service). `make smoke-usage` + manual `docs/e2e-usage-accounting.md`. Final `/code-review`. Close beads, push.

## Self-Review notes

- Obligation coverage: ledger append-only/charge-once (ledger_test), raw-unit mapping (event_test), pricing resolve (pricing_test), aggregation+estimate (summary_test), read path (reader_test), producer keyed events (usage.emitter.spec). pg SQL + amqp + grpc + gateway are integration/e2e-pinned (component tests + smoke), not unit RED — recorded in ADR-0004/this plan, not an oversight.
- No GREEN in the skeleton: every stub body panics/throws not-implemented.
- Reviewable size: ~10 focused RED tests + minimal stubs + the proto/migration diff + ADR + this plan.
