import { beforeAll, describe, expect, it } from 'vitest';
import { context, propagation, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { currentTraceparent, withExtractedContext } from './context';

beforeAll(() => {
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
});

describe('currentTraceparent', () => {
  it('is undefined with no active span', () => {
    expect(currentTraceparent()).toBeUndefined();
  });

  it('serializes the active span as a W3C traceparent', () => {
    const sc = { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 };
    const span = trace.wrapSpanContext(sc);
    context.with(trace.setSpan(context.active(), span), () => {
      expect(currentTraceparent()).toBe(`00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`);
    });
  });
});

describe('withExtractedContext', () => {
  it('runs fn with the extracted trace id active', () => {
    const tp = `00-${'c'.repeat(32)}-${'d'.repeat(16)}-01`;
    const seen = withExtractedContext(tp, () => trace.getActiveSpan()?.spanContext().traceId);
    expect(seen).toBe('c'.repeat(32));
  });

  it('runs fn unchanged when traceparent is missing', () => {
    expect(withExtractedContext(undefined, () => 42)).toBe(42);
  });
});
