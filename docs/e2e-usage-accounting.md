# Manual e2e — usage accounting (session 012)

The thin acceptance path for the usage plane: a signed-in user's storage and
processing consumption flows into the append-only ledger and is reflected in the
authed usage summary through the gateway. Run against the live Docker stack.

## Setup

```bash
make dev          # brings up the stack incl. usage-service + rabbitmq + usage-db
make migrate      # now also runs migrate-usage (billing_events + processed_events)
```

## Scenario

1. Sign up / sign in (existing auth flow) — obtain the session cookie.
2. Upload a JPEG and complete the upload (existing upload flow).
   - Expectation: photo-service publishes a `ConsumptionEvent` to `usage.events`
     with `idempotency_key = original:{photo_id}` and one
     `photo_original_stored` / `storage` / `byte` measurement = the original's
     size; usage-service appends one `billing_events` row.
3. Wait for media processing to finish (the photo reaches `ready`).
   - Expectation: photo-service publishes a `ConsumptionEvent` keyed by the
     processing `job_id` with one `photo_variant_generated` / `storage` / `byte`
     measurement per variant + one `photo_processed` / `processing` / `operation`
     measurement; usage-service appends those rows.
4. `GET /v1/usage/summary` through the gateway with the session cookie.
   - Expectation (HTTP 200): `lines` include `photo_original_stored` (storage
     bytes ≈ file size), `photo_variant_generated` (storage bytes), and
     `photo_processed` (total_quantity = 1); `estimated_monthly_cost` is a
     positive decimal string; `currency` = `USD`. The summary is scoped to the
     authenticated `user_id` only.
5. Idempotency: redeliver the same processing result (or restart the consumer so
   the broker redelivers).
   - Expectation: the summary is unchanged — `processed_events` dedups by
     `idempotency_key`, so the ledger is not double-counted (charge-once).
6. Itemized report (s012 add-on): `GET /v1/usage/events` (authed).
   - Expectation (HTTP 200): `lines` is one entry per ledger measurement
     (`photo_original_stored`, `photo_variant_generated`, `photo_processed`), each
     with its `amount` (= quantity × unit_price, 2-dp) + `currency`;
     `filtered_total_amount` is a 2-dp decimal; `total_count` ≥ 3. Filtering by
     `?resource_type=processing` returns only processing lines. In the UI, the
     `/usage` page renders the summary header, the filter bar (date range,
     resource type, operation type), and the paginated line-items table.

## Negative checks

- A *failed* processing outcome emits **no** consumption event (no `photo_processed`).
- Another user's summary does not include this user's rows.

## Automated coverage

- Go unit: `Explode` (raw-unit mapping), `Ledger.Record` (append-only +
  charge-once replay), `StaticResolver`, `BuildSummary`.
- TS unit (photo-service): `UsageEmitter` produces the correct keyed events.
- Component / e2e (this scenario): `make smoke-usage` (GREEN) against the stack.
