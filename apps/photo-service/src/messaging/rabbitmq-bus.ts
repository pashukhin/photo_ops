/**
 * RabbitMQ transport adapter implementing the MessagePublisher / MessageConsumer
 * ports.
 *
 * Broker topology (canonical — mirrored exactly by the Python adapter in
 * apps/media-worker/src/media_worker/messaging/rabbitmq.py):
 *   For a logical name N:
 *     exchange N              — type "direct", durable
 *     queue N                 — durable; x-dead-letter-exchange = N + ".dlx"
 *                               bound to exchange N with routing key N
 *     exchange N + ".dlx"     — type "direct", durable  (dead-letter exchange)
 *     queue N + ".dlq"        — durable
 *                               bound to exchange N + ".dlx" with routing key N
 *
 * WARNING: Do NOT change the topology (durable flags, DLX arg key, DLQ binding
 * routing key) without updating the Python adapter in the same commit. Any
 * mismatch causes PRECONDITION_FAILED on assertQueue when the two services race
 * to declare the same queue with different parameters.
 */
import * as amqp from 'amqplib';

import type { BusMessage, MessageConsumer, MessagePublisher } from './messaging.port';

type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>>;

function logBrokerEvent(event: string, detail?: unknown): void {
  console.error(
    JSON.stringify({
      level: 'error',
      msg: `rabbitmq.connection.${event}`,
      detail: detail instanceof Error ? detail.message : detail
    })
  );
}

export class RabbitMqBus implements MessagePublisher, MessageConsumer {
  private readonly declared = new Set<string>();

  private constructor(
    private readonly connection: AmqpConnection,
    private readonly channel: amqp.Channel
  ) {}

  static async create(url: string): Promise<RabbitMqBus> {
    const connection = await amqp.connect(url);
    const channel = await connection.createChannel();
    // Surface broker disconnects as a clear log line rather than an opaque
    // unhandled 'error' crash. No automatic reconnect in this slice — a dropped
    // connection stops consumption until the process is restarted (tracked as a
    // follow-up hardening task).
    connection.on('error', (err) => logBrokerEvent('error', err));
    connection.on('close', () => logBrokerEvent('closed'));
    return new RabbitMqBus(connection, channel);
  }

  // ---------------------------------------------------------------------------
  // Topology
  // ---------------------------------------------------------------------------

  private async ensureTopology(name: string): Promise<void> {
    if (this.declared.has(name)) return;

    const dlxName = `${name}.dlx`;
    const dlqName = `${name}.dlq`;

    // Main exchange
    await this.channel.assertExchange(name, 'direct', { durable: true });

    // Dead-letter exchange + queue
    await this.channel.assertExchange(dlxName, 'direct', { durable: true });
    await this.channel.assertQueue(dlqName, { durable: true });
    // DLQ binding: routing key is N (not N.dlq) — must mirror Python exactly
    await this.channel.bindQueue(dlqName, dlxName, name);

    // Main queue — dead-letters to the DLX
    await this.channel.assertQueue(name, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': dlxName }
    });
    await this.channel.bindQueue(name, name, name);

    this.declared.add(name);
  }

  // ---------------------------------------------------------------------------
  // MessagePublisher port
  // ---------------------------------------------------------------------------

  async publish(destination: string, msg: BusMessage): Promise<void> {
    await this.ensureTopology(destination);
    this.channel.publish(destination, destination, Buffer.from(msg.body), {
      persistent: true,
      correlationId: msg.correlationId
    });
  }

  // ---------------------------------------------------------------------------
  // MessageConsumer port
  // ---------------------------------------------------------------------------

  async consume(source: string, handler: (msg: BusMessage) => Promise<void>): Promise<void> {
    await this.ensureTopology(source);
    await this.channel.prefetch(1);
    // amqplib's consume callback is typed as (msg) => void, so we wrap the
    // async work in a fire-and-forget IIFE; ack/nack happen inside the promise.
    const onMessage = (raw: amqp.ConsumeMessage | null): void => {
      if (!raw) return; // consumer cancelled by broker
      const busMsg: BusMessage = {
        body: new Uint8Array(raw.content),
        correlationId: raw.properties.correlationId ?? ''
      };
      void (async () => {
        try {
          await handler(busMsg);
          this.channel.ack(raw);
        } catch (err) {
          console.error(
            JSON.stringify({
              level: 'error',
              msg: 'rabbitmq.handler.error',
              correlationId: busMsg.correlationId,
              error: err instanceof Error ? err.message : String(err)
            })
          );
          // nack without requeue → message goes to DLQ
          this.channel.nack(raw, false, false);
        }
      })();
    };
    await this.channel.consume(source, onMessage);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async close(): Promise<void> {
    try {
      await this.channel.close();
    } catch {
      // ignore errors on already-closed channel
    }
    try {
      await this.connection.close();
    } catch {
      // ignore errors on already-closed connection
    }
  }
}
