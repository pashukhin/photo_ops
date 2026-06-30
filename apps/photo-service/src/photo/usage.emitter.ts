import { currentTraceparent } from '@photoops/observability';
import { MessagePublisher } from '../messaging/messaging.port';
import { ProcessingResultInput } from './photo.types';
import { encodeConsumptionEvent } from './usage.codec';

// Logical destination for the consumption-event stream (mirrors the canonical
// broker topology; declared by usage-service's Go consumer).
export const USAGE_EVENTS_DEST = 'usage.events';

// UsageEmitter publishes ConsumptionEvents to usage-service. It is the
// producer half of the usage contract: photo-service knows its own storage and
// processing facts and reports them as RAW units + provenance (provider),
// never money. Charge-once keys make redelivery / replay harmless.
export class UsageEmitter {
  constructor(
    private readonly publisher: MessagePublisher,
    private readonly provider: string // physical provenance: where this instance runs (env)
  ) {}

  // Emitted on CompleteUpload success. Key `original:{photoId}` (one original
  // per photo). One storage measurement = the original's byte size.
  async emitOriginalStored(input: { photoId: string; userId: string; sizeBytes: bigint }): Promise<void> {
    const { photoId, userId, sizeBytes } = input;
    const correlationId = currentTraceparent() ?? '';
    const body = encodeConsumptionEvent({
      idempotencyKey: `original:${photoId}`,
      userId,
      provider: this.provider,
      occurredAt: new Date().toISOString(),
      measurements: [
        {
          eventType: 'photo_original_stored',
          resourceType: 'storage',
          quantity: Number(sizeBytes),
          unit: 'byte',
          sourceEntityType: 'photo',
          sourceEntityId: photoId
        }
      ],
      correlationId
    });
    await this.publisher.publish(USAGE_EVENTS_DEST, { body, correlationId });
  }

  // Emitted on processing-result SUCCESS. Key `{jobId}`. One
  // photo_variant_generated/storage measurement per produced variant (bytes,
  // attributed to the photo) + one photo_processed/processing count (attributed
  // to the job). Caller must NOT invoke this for a failed outcome.
  async emitProcessingConsumption(input: { result: ProcessingResultInput; userId: string }): Promise<void> {
    const { result, userId } = input;
    const correlationId = currentTraceparent() ?? '';
    const variantMeasurements = result.variants.map((v) => ({
      eventType: 'photo_variant_generated',
      resourceType: 'storage',
      quantity: Number(v.sizeBytes),
      unit: 'byte',
      sourceEntityType: 'photo',
      sourceEntityId: result.photoId
    }));
    const processedMeasurement = {
      eventType: 'photo_processed',
      resourceType: 'processing',
      quantity: 1,
      unit: 'operation',
      sourceEntityType: 'processing_job',
      sourceEntityId: result.jobId
    };
    const body = encodeConsumptionEvent({
      idempotencyKey: result.jobId,
      userId,
      provider: this.provider,
      occurredAt: new Date().toISOString(),
      measurements: [...variantMeasurements, processedMeasurement],
      correlationId
    });
    await this.publisher.publish(USAGE_EVENTS_DEST, { body, correlationId });
  }
}
