---
title: Structured logging / observability shape
tags:
    - logging
    - observability
    - tracing
priority: high
created: "2026-07-26T16:53:00Z"
updated: "2026-07-26T16:53:00Z"
---
@photoops/observability holds the propagation-only OTel bootstrap (startTracing), pino
options (single REDACT_PATHS + trace_id/span_id mixin), traceparent bridge helpers
(currentTraceparent/withExtractedContext), and GrpcLoggingInterceptor. TS services use
nestjs-pino. The async hop carries the FULL W3C traceparent in the proto correlation_id
field (photo-service stamps it on publish, re-binds on result consume); job_id stays the
idempotency key. media-worker logs trace_id parsed from correlation_id with no Python OTel
SDK. No exporter/backend — propagation + log correlation only.
