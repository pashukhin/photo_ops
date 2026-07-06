import { currentTraceparent } from '@photoops/observability';
import { MessagePublisher } from '../messaging/messaging.port';
import { encodeConsumptionEvent } from './usage.codec';

// Logical destination for the consumption-event stream (declared by usage-service's
// Go consumer; topology mirrored by the RabbitMqBus adapter).
export const USAGE_EVENTS_DEST = 'usage.events';

// The producer half of the usage contract for publication-service: a published
// post is a charge-once product action. Money is never computed here — just the
// raw action + provenance (provider). Redelivery/replay is harmless (charge-once
// keys). Emit is best-effort and fire-and-forget at the call site (design D6).
export interface PostUsagePort {
  emitPostPublished(input: { postId: string; userId: string }): Promise<void>;
}

export class PostUsageEmitter implements PostUsagePort {
  constructor(
    private readonly publisher: MessagePublisher,
    private readonly provider: string // physical provenance: where this instance runs (env)
  ) {}

  // Emitted on the transition into `published`. Key `published:{postId}` — one
  // event per post; republish dedups at the usage consumer.
  async emitPostPublished(input: { postId: string; userId: string }): Promise<void> {
    const { postId, userId } = input;
    const correlationId = currentTraceparent() ?? '';
    const body = encodeConsumptionEvent({
      idempotencyKey: `published:${postId}`,
      userId,
      provider: this.provider,
      occurredAt: new Date().toISOString(),
      measurements: [
        {
          eventType: 'post_published',
          resourceType: 'publication',
          quantity: 1,
          unit: 'event',
          sourceEntityType: 'post',
          sourceEntityId: postId
        }
      ],
      correlationId
    });
    await this.publisher.publish(USAGE_EVENTS_DEST, { body, correlationId });
  }
}
