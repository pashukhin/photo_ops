# Usage Detail Report (UI add-on) Skeleton Commit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to fill this skeleton task-by-task — each task makes its RED tests green within the provided stubs. Steps use checkbox (`- [ ]`) syntax.

**Goal:** An itemized usage report UI (page `/usage`): line items (one per ledger entry) with consumed units + per-row cost, filterable by occurred-at date range, resource type, and operation type, paginated, with an aggregate summary header. Extends the s012 usage plane (same branch / PR #1).

**Architecture / WHY:** Line-items granularity (one row per measurement) — no schema change; per-operation rollup is a future seam (`photo_ops-8t5`). Each line is priced by its OWN provenance (row provider + occurred_at). Entry points — contract → `proto/usage/v1/usage_service.proto` (`ListUsageEvents`); Go cost logic → `apps/usage-service/internal/usage/events.go` + `reader.go`; store query → `internal/store/postgres.go`; gateway route → `apps/api-gateway/src/http/usage.controller.ts` + `grpc/usage.client.ts`; web → `apps/web/lib/api.ts` + `components/usage/UsageReport.tsx` + `app/usage/page.tsx`; behavior → the `*_test.go` / `*.spec.ts(x)` files.

**Tech Stack:** Go (usage-service); NestJS (gateway); Next.js + Tailwind/shadcn (web).

## Global Constraints

- Line cost = quantity × unit_price via the pricing `Resolver`, priced per ROW's own provenance; amount formatted to 2 dp (consistent with the summary). `filtered_total_amount` = cost over the WHOLE filter (not just the page), via a GROUP BY(resource_type,unit)-over-filter aggregate → resolve → sum.
- Filter/pagination are server-side (mirror the 011 gallery): `page` 0→1, `page_size` 0→25 clamp 1..100 (server-side, in Go `ListUsageEvents`); the gateway passes raw values, inventing no defaults.
- The events route is session-authed exactly like the summary route; `user_id` from the validated session, never the query.
- `billing_events` stays append-only / money-free (read-time pricing) — this is read-only reporting; no schema change.

## Non-Goals

Per-operation rollup (operation_id migration → `photo_ops-8t5`); column sorting; CSV export; charts. The visual widgets (date pickers, selects, table styling) are the exploratory lane — verified by `make smoke-ui` + manual e2e, not frozen in jsdom (mirrors 011).

---

### Task 1: Proto — ListUsageEvents (done in skeleton)

Already in the skeleton: `ListUsageEvents` RPC + `ListUsageEventsRequest` / `UsageEventLine` / `ListUsageEventsResponse` in `usage_service.proto`; regenerated TS + Go pb. No GREEN work — verify `make proto-check` clean.

### Task 2: Go — filtered list + per-row cost (fill RED green)

**Files:** `internal/usage/events.go` (`BuildEventLines`), `internal/usage/reader.go` (`EventsForUser`), `internal/store/postgres.go` (`ListEvents`, `SumByResourceFiltered`). RED: `internal/usage/events_test.go`, the `TestReaderEventsForUser*` in `reader_test.go`.

- [ ] `BuildEventLines` — per row resolve (row.Provider, resource, unit, row.OccurredAt) → unit_price + amount = quantity × unit_price (2 dp); unpriced row → "0.00"; carry all row fields.
- [ ] `Reader.EventsForUser` — `store.ListEvents(filter)` → `BuildEventLines` for the page; `store.SumByResourceFiltered(filter)` → `BuildSummary` → `FilteredTotalAmount`/`Currency`; pass `TotalCount` through.
- [ ] `store.ListEvents` — `WHERE user_id + occurred_at BETWEEN (when set) + resource_type + event_type`, `ORDER BY occurred_at DESC`, `LIMIT/OFFSET`; + `COUNT(*)` for total. `SumByResourceFiltered` — `SumByResource` SQL + the same WHERE. (SQL smoke-verified, not unit RED — `4vg` deferred.)
- [ ] `make test-usage` green; `make vet-usage` + golangci-lint clean. Commit.

### Task 3: usage-service gRPC handler + cmd (fill green)

**Files:** `internal/grpcserver/server.go` (`ListUsageEvents`).

- [ ] Map `*pb.ListUsageEventsRequest` → `usage.EventFilter` (parse `occurred_from`/`to` RFC3339 → `*time.Time`; page 0→1; page_size 0→25 clamp 1..100), call `reader.EventsForUser`, map `EventReport` → pb response. Smoke/e2e-verified. Commit.

### Task 4: Gateway route (fill RED green)

**Files:** `apps/api-gateway/src/http/usage.controller.ts` (`@Get('events')`), `grpc/usage.client.ts` (already plumbed). RED: `usage.controller.spec.ts`.

- [ ] `listUsageEvents`: `requireSession` → userId FIRST (401 when unauth), then map query → `ListUsageEventsInput` and call the client. `make test-api` green. Commit.

### Task 5: Web /usage page (fill RED green)

**Files:** `apps/web/lib/api.ts` (`getUsageSummary`, `listUsageEvents`), `components/usage/UsageReport.tsx` (+ split into table/filter-bar/pagination reusing 011 patterns as needed), `app/usage/page.tsx` (done). RED: `lib/api.spec.ts` (usage), `components/usage/UsageReport.spec.tsx`.

- [ ] `lib/api`: implement the two fetchers (query construction pinned by api.spec).
- [ ] `UsageReport`: fetch summary + events on mount; render the summary header, the filter bar (date-from/to, resource_type + event_type selects with options from the summary lines), the line-items table (date · operation · resource · qty+unit · cost) + filtered total + pagination; a filter change refetches. Reuse `components/ui` + the 011 table/toolbar/pagination. `make test-web` green; typecheck clean. (Widget mechanics → smoke-ui.) Commit.
- [ ] Optional: a nav link to `/usage` from the main page.

### Task 6: Smoke + docs

**Files:** `scripts/smoke-usage.sh`, `docs/e2e-usage-accounting.md`.

- [ ] Extend `smoke-usage.sh` to `GET /v1/usage/events` (filtered) and assert line items + `filtered_total_amount`; smoke-ui for the page. Update the e2e doc. Commit.

### Task 7: whole-branch verification

- [ ] `make gate` green; live smoke (`make smoke-usage` + the page). Final `/code-review` on the add-on range. Close `photo_ops-pwf.*`, push.

## Self-Review notes

- Obligation coverage: per-row cost (events_test), report composition (reader EventsForUser test), gateway query→input + auth (usage.controller.spec), web query construction (api.spec) + data-flow/filter (UsageReport.spec). store SQL + grpc mapping + the visual widgets are smoke/e2e-pinned (recorded here, not an oversight).
- No GREEN in the skeleton: every stub panics/throws/placeholder.
- Reviewable size: ~9 focused RED tests + minimal stubs + the proto diff + this plan.
