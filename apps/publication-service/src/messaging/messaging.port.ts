export interface BusMessage {
  body: Uint8Array;
  correlationId: string;
}

export interface MessagePublisher {
  publish(destination: string, msg: BusMessage): Promise<void>;
}

// DI token for the publisher port. The bound adapter (LazyRabbitMqPublisher) is
// swapped at the module level without touching business code.
export const MESSAGE_PUBLISHER = 'MESSAGE_PUBLISHER';
