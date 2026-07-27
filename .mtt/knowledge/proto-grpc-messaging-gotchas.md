---
title: proto/gRPC + messaging gotchas
tags:
    - grpc
    - proto
    - rabbitmq
priority: high
created: "2026-07-26T16:53:00Z"
updated: "2026-07-26T16:53:00Z"
---
(1) packages/proto-ts is SOURCE-ONLY (main: src/index.ts, imports uninstalled
@bufbuild/protobuf) — NOT runtime-consumable. For runtime encode/decode use protobufjs
loadSync over the .proto (camelCase fields, longs:String→bigint, enums:Number) as in
apps/photo-service/src/photo/processing.codec.ts; the Python worker uses generated _pb2
(snake_case).
(2) proto3 `optional` compiles to a synthetic `_field` oneof; @grpc/proto-loader surfaces
it as `_lat`/`_lon` props that leak through a spread — strip underscore-prefixed keys in
the gateway mapPhoto.
(3) Both RabbitMQ adapters (TS amqplib + Python pika) connect at startup with bounded
retry (broker boot race); the canonical topology (exchange/queue/DLX/DLQ, dlq
routing-key=N) is mirrored EXACTLY on both sides — change both together or assertQueue
fails PRECONDITION_FAILED.
