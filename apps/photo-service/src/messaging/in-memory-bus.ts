import type { BusMessage, MessageConsumer, MessagePublisher } from './messaging.port';

const MAX_ATTEMPTS = 3;

export class InMemoryBus implements MessagePublisher, MessageConsumer {
  private readonly handlers = new Map<string, (msg: BusMessage) => Promise<void>>();
  private readonly queue: Array<{ destination: string; msg: BusMessage }> = [];

  async consume(source: string, handler: (msg: BusMessage) => Promise<void>): Promise<void> {
    this.handlers.set(source, handler);
  }

  async publish(destination: string, msg: BusMessage): Promise<void> {
    this.queue.push({ destination, msg });
  }

  async drain(): Promise<void> {
    while (this.queue.length > 0) {
      const entry = this.queue.shift()!;
      const handler = this.handlers.get(entry.destination);
      if (!handler) continue;

      let attempt = 0;
      while (attempt < MAX_ATTEMPTS) {
        attempt++;
        try {
          await handler(entry.msg);
          break;
        } catch {
          if (attempt >= MAX_ATTEMPTS) {
            // drop after max attempts
          }
        }
      }
    }
  }
}
