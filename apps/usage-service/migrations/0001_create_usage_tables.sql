-- Migration 0001: usage-accounting schema (usage-db).
-- Append-only consumption ledger + an idempotency inbox for charge-once intake.

-- billing_events: one row per measurement. APPEND-ONLY — never updated or
-- deleted. Stores RAW provider-independent units + physical provenance
-- (provider, occurred_at). Money is intentionally NOT stored here: unit_price /
-- amount / currency are resolved at read from the pricing layer (a replaceable
-- seam), so a tariff change never has to mutate an immutable ledger row. See
-- ADR-0004 for why this deviates from the TZ BillingEvent column list.
CREATE TABLE IF NOT EXISTS billing_events (
  id                 uuid        PRIMARY KEY,
  user_id            uuid        NOT NULL,
  event_type         text        NOT NULL,
  resource_type      text        NOT NULL,
  quantity           bigint      NOT NULL,
  unit               text        NOT NULL,
  provider           text        NOT NULL,
  source_entity_type text        NOT NULL,
  source_entity_id   uuid        NOT NULL,
  occurred_at        timestamptz NOT NULL,
  recorded_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_events_user_idx ON billing_events (user_id);

-- processed_events: charge-once inbox. The producer supplies a stable
-- idempotency_key per operation (media job_id, "original:{photo_id}", cluster
-- result_id). Intake inserts the key with ON CONFLICT DO NOTHING in the SAME
-- transaction as the ledger rows; a conflict (key already present) means the
-- whole event is a replay and the ledger rows are skipped — exactly-once
-- accounting over an at-least-once broker.
CREATE TABLE IF NOT EXISTS processed_events (
  idempotency_key text        PRIMARY KEY,
  recorded_at     timestamptz NOT NULL DEFAULT now()
);
