import { describe, expect, it } from 'vitest';
import { context, trace } from '@opentelemetry/api';
import pino from 'pino';
import { makeLoggerOptions, REDACT_PATHS, traceMixin } from './logger';

function captureLine(fn: (logger: pino.Logger) => void): Record<string, unknown> {
  const lines: string[] = [];
  const stream = { write: (s: string) => lines.push(s) };
  const logger = pino(makeLoggerOptions('test-service'), stream);
  fn(logger);
  return JSON.parse(lines[lines.length - 1]);
}

describe('makeLoggerOptions', () => {
  it('stamps the service name', () => {
    const line = captureLine((l) => l.info('hello'));
    expect(line.service).toBe('test-service');
  });

  it('redacts secrets', () => {
    const line = captureLine((l) =>
      l.info(
        {
          password: 'hunter2',
          passwordHash: '$argon2id$abc',
          uploadUrl: 'https://minio/put?X-Amz-Signature=secret',
          nested: { password: 'inner' }
        },
        'sensitive'
      )
    );
    expect(line.password).toBe('[REDACTED]');
    expect(line.passwordHash).toBe('[REDACTED]');
    expect(line.uploadUrl).toBe('[REDACTED]');
    expect((line.nested as Record<string, unknown>).password).toBe('[REDACTED]');
  });
});

describe('traceMixin', () => {
  it('returns empty ids with no active span', () => {
    expect(traceMixin()).toEqual({ trace_id: '', span_id: '' });
  });

  it('returns the active span ids', () => {
    const sc = { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 };
    const span = trace.wrapSpanContext(sc);
    context.with(trace.setSpan(context.active(), span), () => {
      expect(traceMixin()).toEqual({ trace_id: 'a'.repeat(32), span_id: 'b'.repeat(16) });
    });
  });
});

describe('REDACT_PATHS', () => {
  it('covers cookies and authorization headers', () => {
    expect(REDACT_PATHS).toContain('req.headers.cookie');
    expect(REDACT_PATHS).toContain('req.headers.authorization');
  });
});
