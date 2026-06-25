import { isSpanContextValid, trace } from '@opentelemetry/api';
import type { LoggerOptions } from 'pino';
import type { Options } from 'pino-http';

/**
 * Single source of truth for secret redaction. pino redacts these paths on
 * every log object (including the auto-logged HTTP req/res). Never duplicate
 * this list into a service — import it.
 */
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
  'uploadUrl',
  '*.uploadUrl',
  'presignedUrl',
  '*.presignedUrl'
];

/** Injects the active OTel trace/span ids into every log line. */
export function traceMixin(): { trace_id: string; span_id: string } {
  const span = trace.getActiveSpan();
  if (!span) return { trace_id: '', span_id: '' };
  const sc = span.spanContext();
  if (!isSpanContextValid(sc)) return { trace_id: '', span_id: '' };
  return { trace_id: sc.traceId, span_id: sc.spanId };
}

/** pino options shared by every TS service (and the gRPC interceptor). */
export function makeLoggerOptions(serviceName: string): LoggerOptions {
  return {
    level: process.env.LOG_LEVEL ?? 'info',
    base: { service: serviceName },
    mixin: traceMixin,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' }
  };
}

/** pino options typed for nestjs-pino's `pinoHttp` (centralizes the LoggerOptions->Options widening). */
export function makePinoHttpOptions(serviceName: string): Options {
  return makeLoggerOptions(serviceName) as Options;
}
