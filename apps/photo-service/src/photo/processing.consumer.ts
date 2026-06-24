import { MessageConsumer } from '../messaging/messaging.port';
import { decodeResult } from './processing.codec';
import { ProcessingResultInput } from './photo.types';

export const PROCESS_RESULT_SOURCE = 'photo.result';

// Minimal port so the consumer can be tested with a stub without pulling in
// the full PhotoDomainService. PhotoDomainService satisfies this structurally.
export interface FinalizeResultPort {
  finalizeResult(result: ProcessingResultInput): Promise<void>;
}

export class ProcessingResultConsumer {
  constructor(
    private readonly consumer: MessageConsumer,
    private readonly service: FinalizeResultPort
  ) {}

  async start(): Promise<void> {
    await this.consumer.consume(PROCESS_RESULT_SOURCE, async (msg) => {
      const result = decodeResult(msg.body);
      await this.service.finalizeResult(result);
    });
  }
}
