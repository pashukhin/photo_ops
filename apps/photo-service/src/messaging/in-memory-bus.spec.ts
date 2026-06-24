import { describe, expect, it } from 'vitest';
import { InMemoryBus } from './in-memory-bus';

describe('InMemoryBus', () => {
  it('delivers a published message to a consumer on the same name, ack on success', async () => {
    const bus = new InMemoryBus();
    const received: string[] = [];
    await bus.consume('photo.process', async (m) => { received.push(m.correlationId); });
    await bus.publish('photo.process', { body: new Uint8Array([1]), correlationId: 'corr-1' });
    await bus.drain();
    expect(received).toEqual(['corr-1']);
  });

  it('redelivers when the handler throws, then stops after success', async () => {
    const bus = new InMemoryBus();
    let attempts = 0;
    await bus.consume('q', async () => { attempts++; if (attempts < 2) throw new Error('boom'); });
    await bus.publish('q', { body: new Uint8Array(), correlationId: 'c' });
    await bus.drain();
    expect(attempts).toBe(2);
  });
});
