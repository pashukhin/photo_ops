export interface BusMessage {
  body: Uint8Array;
  correlationId: string;
}

export interface MessagePublisher {
  publish(destination: string, msg: BusMessage): Promise<void>;
}

export interface MessageConsumer {
  consume(source: string, handler: (msg: BusMessage) => Promise<void>): Promise<void>;
}

// DI token for the publisher port. The bound adapter (in-memory fake now,
// RabbitMQ in Task 4.1) is swapped at the module level without touching
// business code.
export const MESSAGE_PUBLISHER = 'MESSAGE_PUBLISHER';
