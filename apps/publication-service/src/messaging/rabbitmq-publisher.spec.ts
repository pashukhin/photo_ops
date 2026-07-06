import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the transport so no real broker is needed. Each create() yields a fresh
// FakeBus; tests drive its publish outcome.
class FakeBus {
  public closed = false;
  public publishImpl: () => Promise<void> = () => Promise.resolve();
  publish(): Promise<void> {
    return this.publishImpl();
  }
  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

const created: FakeBus[] = [];
const createMock = vi.fn();
vi.mock('./rabbitmq-bus', () => ({
  RabbitMqBus: { create: (...args: unknown[]) => createMock(...args) as Promise<FakeBus> }
}));

import { LazyRabbitMqPublisher } from './rabbitmq-publisher';

beforeEach(() => {
  created.length = 0;
  createMock.mockReset();
  createMock.mockImplementation(() => {
    const bus = new FakeBus();
    created.push(bus);
    return Promise.resolve(bus);
  });
});

const msg = { body: new Uint8Array(), correlationId: '' };

describe('LazyRabbitMqPublisher', () => {
  it('does not connect until the first publish (no boot dependency)', () => {
    new LazyRabbitMqPublisher('amqp://x');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('connects once and reuses the connection across emits', async () => {
    const pub = new LazyRabbitMqPublisher('amqp://x');
    await pub.publish('usage.events', msg);
    await pub.publish('usage.events', msg);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('on a publish failure: closes the dead bus, resets the cache, reconnects next emit', async () => {
    // why: a broker blip must NOT permanently kill emission — the next emit must
    // reconnect — and the dead bus must be closed so its socket is not orphaned.
    const pub = new LazyRabbitMqPublisher('amqp://x');
    createMock.mockImplementationOnce(() => {
      const bus = new FakeBus();
      bus.publishImpl = () => Promise.reject(new Error('channel closed'));
      created.push(bus);
      return Promise.resolve(bus);
    });

    await expect(pub.publish('usage.events', msg)).rejects.toThrow('channel closed');
    expect(created[0].closed).toBe(true); // dead bus closed — no connection leak

    await pub.publish('usage.events', msg); // reconnects to a fresh, healthy bus
    expect(createMock).toHaveBeenCalledTimes(2);
  });
});
