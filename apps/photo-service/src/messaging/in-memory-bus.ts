import type { BusMessage, MessageConsumer, MessagePublisher } from './messaging.port';

const MAX_ATTEMPTS = 3;

export class InMemoryBus implements MessagePublisher, MessageConsumer {
  private readonly handlers = new Map<string, (msg: BusMessage) => Promise<void>>();
  private readonly queue: Array<{ destination: string; msg: BusMessage }> = [];

  // consume() overwrites any existing handler for a name (single-consumer fake).
  consume(source: string, handler: (msg: BusMessage) => Promise<void>): Promise<void> {
    this.handlers.set(source, handler);
    return Promise.resolve();
  }

  publish(destination: string, msg: BusMessage): Promise<void> {
    this.queue.push({ destination, msg });
    return Promise.resolve();
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
          // failed attempt; retry until MAX_ATTEMPTS total, then drop
        }
      }
    }
  }
}
