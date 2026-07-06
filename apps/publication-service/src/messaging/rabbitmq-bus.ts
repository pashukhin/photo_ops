/**
 * RabbitMQ transport adapter implementing the MessagePublisher port.
 *
 * Copied verbatim from photo-service's adapter so the `usage.events` topology it
 * declares matches photo-service and usage-service's Go consumer EXACTLY — any
 * mismatch (durable flags, DLX arg key, DLQ binding routing key) causes
 * PRECONDITION_FAILED on assertQueue when services race to declare the same
 * queue. publication-service only publishes (no consume), but declaring the
 * canonical topology keeps it compatible with the other declarers.
 *
 * Broker topology (canonical) for a logical name N:
 *   exchange N            — type "direct", durable
 *   queue N               — durable; x-dead-letter-exchange = N + ".dlx"; bound to N with key N
 *   exchange N + ".dlx"   — type "direct", durable
 *   queue N + ".dlq"      — durable; bound to N.dlx with key N
 */
import * as amqp from 'amqplib';

import type { BusMessage, MessagePublisher } from './messaging.port';

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry(url: string, attempts: number, delayMs: number): Promise<AmqpConnection> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await amqp.connect(url);
    } catch (err) {
      if (attempt >= attempts) throw err;
      logBrokerEvent('connect-retry', `attempt ${attempt}/${attempts}`);
      await sleep(delayMs);
    }
  }
}

export class RabbitMqBus implements MessagePublisher {
  private readonly declared = new Set<string>();

  private constructor(
    private readonly connection: AmqpConnection,
    private readonly channel: amqp.Channel
  ) {}

  static async create(url: string, attempts = 15, delayMs = 2000): Promise<RabbitMqBus> {
    const connection = await connectWithRetry(url, attempts, delayMs);
    const channel = await connection.createChannel();
    // Surface broker disconnects as a log line rather than an opaque crash. No
    // automatic reconnect in this slice — a dropped connection stops publishing
    // until the process is restarted.
    connection.on('error', (err) => logBrokerEvent('error', err));
    connection.on('close', () => logBrokerEvent('closed'));
    return new RabbitMqBus(connection, channel);
  }

  private async ensureTopology(name: string): Promise<void> {
    if (this.declared.has(name)) return;

    const dlxName = `${name}.dlx`;
    const dlqName = `${name}.dlq`;

    await this.channel.assertExchange(name, 'direct', { durable: true });

    await this.channel.assertExchange(dlxName, 'direct', { durable: true });
    await this.channel.assertQueue(dlqName, { durable: true });
    await this.channel.bindQueue(dlqName, dlxName, name);

    await this.channel.assertQueue(name, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': dlxName }
    });
    await this.channel.bindQueue(name, name, name);

    this.declared.add(name);
  }

  async publish(destination: string, msg: BusMessage): Promise<void> {
    await this.ensureTopology(destination);
    this.channel.publish(destination, destination, Buffer.from(msg.body), {
      persistent: true,
      correlationId: msg.correlationId
    });
  }

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
