import { describe, it, expect } from 'vitest';
import { join } from 'path';
import * as protobuf from 'protobufjs';
import { UsageEmitter, USAGE_EVENTS_DEST } from './usage.emitter';
import { BusMessage, MessagePublisher } from '../messaging/messaging.port';

const root = protobuf.loadSync(join(process.cwd(), '../../proto/usage/v1/consumption.proto'));
const ConsumptionEventType = root.lookupType('photoops.usage.v1.ConsumptionEvent');

interface DecodedMeasurement {
  eventType: string;
  resourceType: string;
  quantity: string;
  unit: string;
  sourceEntityType: string;
  sourceEntityId: string;
}
interface DecodedEvent {
  idempotencyKey: string;
  userId: string;
  provider: string;
  occurredAt: string;
  measurements: DecodedMeasurement[];
}

function decode(body: Uint8Array): DecodedEvent {
  return ConsumptionEventType.toObject(ConsumptionEventType.decode(body), {
    longs: String,
    defaults: true
  }) as DecodedEvent;
}

class CapturingPublisher implements MessagePublisher {
  public sent: Array<{ destination: string; msg: BusMessage }> = [];
  async publish(destination: string, msg: BusMessage): Promise<void> {
    this.sent.push({ destination, msg });
  }
}

describe('UsageEmitter', () => {
  it('emits photo_original_stored to usage.events keyed by original:{photoId}', async () => {
    // why: storage is recorded as a one-shot bytes event at upload completion,
    // charge-once per photo original.
    const pub = new CapturingPublisher();
    await new UsageEmitter(pub, 'local-demo').emitOriginalStored({
      photoId: 'p-1',
      userId: 'u-1',
      sizeBytes: 842n
    });

    expect(pub.sent).toHaveLength(1);
    expect(pub.sent[0].destination).toBe(USAGE_EVENTS_DEST);
    const e = decode(pub.sent[0].msg.body);
    expect(e.idempotencyKey).toBe('original:p-1');
    expect(e.userId).toBe('u-1');
    expect(e.provider).toBe('local-demo');
    expect(e.measurements).toHaveLength(1);
    expect(e.measurements[0]).toMatchObject({
      eventType: 'photo_original_stored',
      resourceType: 'storage',
      quantity: '842',
      unit: 'byte',
      sourceEntityType: 'photo',
      sourceEntityId: 'p-1'
    });
  });

  it('emits one variant-bytes measurement per variant plus a processed count, keyed by jobId', async () => {
    // why: a processing run consumes storage (each variant's bytes) AND one
    // processing operation; all measurements ride under the job's charge-once key.
    const pub = new CapturingPublisher();
    await new UsageEmitter(pub, 'local-demo').emitProcessingConsumption({
      userId: 'u-1',
      result: {
        jobId: 'job-1',
        photoId: 'p-1',
        outcome: 'succeeded',
        metadataJson: '',
        variants: [
          { variantType: 'thumbnail', objectKey: 'k1', width: 10, height: 10, sizeBytes: 100n, contentType: 'image/jpeg' },
          { variantType: 'preview', objectKey: 'k2', width: 20, height: 20, sizeBytes: 300n, contentType: 'image/jpeg' }
        ]
      }
    });

    expect(pub.sent).toHaveLength(1);
    const e = decode(pub.sent[0].msg.body);
    expect(e.idempotencyKey).toBe('job-1');

    const variantMs = e.measurements.filter((m) => m.eventType === 'photo_variant_generated');
    const processedMs = e.measurements.filter((m) => m.eventType === 'photo_processed');
    expect(variantMs).toHaveLength(2);
    expect(variantMs.map((m) => m.quantity).sort()).toEqual(['100', '300']);
    expect(variantMs.every((m) => m.resourceType === 'storage' && m.unit === 'byte')).toBe(true);
    expect(processedMs).toHaveLength(1);
    expect(processedMs[0]).toMatchObject({
      resourceType: 'processing',
      quantity: '1',
      unit: 'operation',
      sourceEntityType: 'processing_job',
      sourceEntityId: 'job-1'
    });
  });
});
