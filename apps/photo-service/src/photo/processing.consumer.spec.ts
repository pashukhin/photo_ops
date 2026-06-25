import { join } from 'path';
import * as protobuf from 'protobufjs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { context, propagation, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { InMemoryBus } from '../messaging/in-memory-bus';
import { ProcessingResultConsumer, PROCESS_RESULT_SOURCE } from './processing.consumer';

beforeAll(() => {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
});

const root = protobuf.loadSync(join(process.cwd(), '../../proto/photo/v1/processing.proto'));
const PhotoProcessingResultType = root.lookupType('photoops.photo.v1.PhotoProcessingResult');

describe('ProcessingResultConsumer', () => {
  it('calls finalizeResult with decoded result when a message arrives on photo.result', async () => {
    const bus = new InMemoryBus();
    const service = { finalizeResult: vi.fn().mockResolvedValue(undefined) };

    const body = PhotoProcessingResultType.encode(
      PhotoProcessingResultType.fromObject({
        jobId: 'j1',
        photoId: 'p1',
        outcome: 1, // SUCCEEDED
        variants: [
          {
            variantType: 'thumbnail',
            objectKey: 'variants/p1/thumbnail.jpg',
            width: 200,
            height: 100,
            sizeBytes: 9999,
            contentType: 'image/jpeg'
          }
        ],
        metadataJson: '{}'
      })
    ).finish();

    const consumer = new ProcessingResultConsumer(bus, service);
    await consumer.start();

    await bus.publish(PROCESS_RESULT_SOURCE, { body, correlationId: 'c1' });
    await bus.drain();

    expect(service.finalizeResult).toHaveBeenCalledOnce();
    const arg = service.finalizeResult.mock.calls[0][0];
    expect(arg.jobId).toBe('j1');
    expect(arg.photoId).toBe('p1');
    expect(arg.outcome).toBe('succeeded');
  });

  it('propagates handler errors so the bus retry policy applies', async () => {
    const bus = new InMemoryBus();
    const service = {
      finalizeResult: vi.fn().mockRejectedValue(new Error('transient failure'))
    };

    const body = PhotoProcessingResultType.encode(
      PhotoProcessingResultType.fromObject({
        jobId: 'j2',
        photoId: 'p2',
        outcome: 1,
        variants: [],
        metadataJson: '{}'
      })
    ).finish();

    const consumer = new ProcessingResultConsumer(bus, service);
    await consumer.start();

    await bus.publish(PROCESS_RESULT_SOURCE, { body, correlationId: 'c2' });
    await bus.drain(); // InMemoryBus retries up to 3 times then drops

    // Should have been called MAX_ATTEMPTS (3) times due to retries
    expect(service.finalizeResult).toHaveBeenCalledTimes(3);
  });

  it('finalizes within the trace context carried by correlation_id', async () => {
    let seenTraceId: string | undefined;
    const service = {
      finalizeResult: vi.fn(() => {
        seenTraceId = trace.getActiveSpan()?.spanContext().traceId;
        return Promise.resolve();
      })
    };
    const bus = new InMemoryBus();
    const consumer = new ProcessingResultConsumer(bus, service);
    await consumer.start();

    const tp = `00-${'e'.repeat(32)}-${'f'.repeat(16)}-01`;
    // Build a real serialized PhotoProcessingResult whose correlationId == tp,
    // using the same encode approach as the other tests in this file.
    const body = PhotoProcessingResultType.encode(
      PhotoProcessingResultType.fromObject({
        jobId: 'j',
        photoId: 'p',
        correlationId: tp,
        outcome: 1,
        variants: [],
        metadataJson: '{}'
      })
    ).finish();
    await bus.publish(PROCESS_RESULT_SOURCE, { body, correlationId: tp });
    await bus.drain();

    expect(seenTraceId).toBe('e'.repeat(32));
  });
});
