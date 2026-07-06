import type { BusMessage, MessagePublisher } from './messaging.port';
import { RabbitMqBus } from './rabbitmq-bus';

/**
 * Lazy, non-throwing-at-boot publisher for the usage.events side-channel.
 *
 * WHY (session 019, design D6): publication-service is NOT a broker consumer —
 * usage is a pure best-effort side-channel. It must not become a boot dependency
 * (photo-service's eager `RabbitMqBus.create()` factory would crash-loop the
 * whole service, and every post RPC incl. the public read, when the broker is
 * down). So this adapter:
 *   - never connects in its constructor (no boot coupling);
 *   - connects lazily on the FIRST publish, with a BOUNDED retry (not the
 *     15x2s default) so a detached emit against a down broker fails fast;
 *   - caches the connection; there is NO auto-reconnect (a broker drop loses
 *     subsequent events until the process restarts — accepted MVP posture).
 * Callers emit fire-and-forget (`void emit().catch(...)`), so a rejection here
 * is swallowed and never affects the RPC.
 */
export class LazyRabbitMqPublisher implements MessagePublisher {
  private busPromise: Promise<RabbitMqBus> | null = null;

  constructor(
    private readonly url: string,
    private readonly opts: { attempts?: number; delayMs?: number } = {}
  ) {}

  private connect(): Promise<RabbitMqBus> {
    // Cache the connect promise so concurrent first-emits share one connection.
    // On failure, clear it so a later emit can retry (still bounded).
    if (!this.busPromise) {
      this.busPromise = RabbitMqBus.create(this.url, this.opts.attempts ?? 2, this.opts.delayMs ?? 500).catch(
        (err) => {
          this.busPromise = null;
          throw err;
        }
      );
    }
    return this.busPromise;
  }

  async publish(destination: string, msg: BusMessage): Promise<void> {
    const bus = await this.connect();
    try {
      await bus.publish(destination, msg);
    } catch (err) {
      // A publish failure usually means the cached connection/channel died (a
      // broker blip; RabbitMqBus has no auto-reconnect). Drop the cache so the
      // NEXT emit reconnects instead of forever retrying a dead channel — one
      // event is lost, not every future event. The caller emits fire-and-forget,
      // so this rejection is swallowed.
      this.busPromise = null;
      throw err;
    }
  }
}
