import { describe, it, expect } from 'vitest';
import { join } from 'path';
import * as protobuf from 'protobufjs';
import { PostUsageEmitter, USAGE_EVENTS_DEST } from './usage.emitter';
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
  }) as unknown as DecodedEvent;
}

class CapturingPublisher implements MessagePublisher {
  public sent: Array<{ destination: string; msg: BusMessage }> = [];
  publish(destination: string, msg: BusMessage): Promise<void> {
    this.sent.push({ destination, msg });
    return Promise.resolve();
  }
}

describe('PostUsageEmitter', () => {
  it('emits post_published to usage.events keyed by published:{postId}', async () => {
    // why: publish is a charge-once product action — one event per post; republish
    // dedups on the idempotency key at the usage consumer.
    const pub = new CapturingPublisher();
    await new PostUsageEmitter(pub, 'local-demo').emitPostPublished({ postId: 'post-1', userId: 'u-1' });

    expect(pub.sent).toHaveLength(1);
    expect(pub.sent[0].destination).toBe(USAGE_EVENTS_DEST);
    const e = decode(pub.sent[0].msg.body);
    expect(e.idempotencyKey).toBe('published:post-1');
    expect(e.userId).toBe('u-1');
    expect(e.provider).toBe('local-demo');
    expect(e.measurements).toEqual([
      {
        eventType: 'post_published',
        resourceType: 'publication',
        quantity: '1',
        unit: 'event',
        sourceEntityType: 'post',
        sourceEntityId: 'post-1'
      }
    ]);
  });
});
