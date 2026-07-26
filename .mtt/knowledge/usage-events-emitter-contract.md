---
title: usage.events emitter contract + lazy-bus rule
tags:
    - contract
    - rabbitmq
    - usage
priority: high
created: "2026-07-26T16:53:00Z"
updated: "2026-07-26T16:53:00Z"
---
Operations emit a ConsumptionEvent proto (proto/usage/v1/consumption.proto) to RabbitMQ
exchange `usage.events` (durable + DLX/DLQ). Fields: idempotency_key (charge-once), user_id,
provider (env), occurred_at (RFC3339), repeated Measurement{event_type, resource_type,
quantity int64, unit, source_entity_type, source_entity_id uuid}. usage-service appends RAW
units to billing_events (append-only, NO money cols) idempotently via a processed_events
inbox; pricing resolved at read (ADR-0004). Emit BEST-EFFORT.

When adding an emitter to a service NOT already a RabbitMQ consumer (e.g. publication-service),
do NOT copy photo-service's eager RABBITMQ_BUS factory: create() retries then throws, and a
root provider resolving the bus at boot means a down broker crash-loops the whole service
(incl. non-emitting reads). Make the publisher LAZY/non-throwing (connect on first emit,
guard each emit).
