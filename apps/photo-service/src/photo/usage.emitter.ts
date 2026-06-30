import { MessagePublisher } from '../messaging/messaging.port';
import { ProcessingResultInput } from './photo.types';

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
    void this.publisher;
    void this.provider;
    void input;
    throw new Error('not implemented'); // GREEN is the implementer's job
  }

  // Emitted on processing-result SUCCESS. Key `{jobId}`. One
  // photo_variant_generated/storage measurement per produced variant (bytes,
  // attributed to the photo) + one photo_processed/processing count (attributed
  // to the job). Caller must NOT invoke this for a failed outcome.
  async emitProcessingConsumption(input: { result: ProcessingResultInput; userId: string }): Promise<void> {
    void input;
    throw new Error('not implemented'); // GREEN is the implementer's job
  }
}
