import { join } from 'path';
import * as protobuf from 'protobufjs';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryBus } from '../messaging/in-memory-bus';
import { ProcessingResultConsumer, PROCESS_RESULT_SOURCE } from './processing.consumer';

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
});
