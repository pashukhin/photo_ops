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
