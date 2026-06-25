import { context, isSpanContextValid, propagation, trace } from '@opentelemetry/api';

/** Build a W3C traceparent string from the active span, or undefined if none. */
export function currentTraceparent(): string | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;
  const sc = span.spanContext();
  if (!isSpanContextValid(sc)) return undefined;
  const flags = sc.traceFlags.toString(16).padStart(2, '0');
  return `00-${sc.traceId}-${sc.spanId}-${flags}`;
}

/**
 * Run `fn` inside the OTel context carried by an inbound traceparent so that
 * logs emitted within it carry the originating trace id. No-op passthrough when
 * the traceparent is absent.
 */
export function withExtractedContext<T>(traceparent: string | undefined, fn: () => T): T {
  if (!traceparent) return fn();
  const ctx = propagation.extract(context.active(), { traceparent });
  return context.with(ctx, fn);
}
