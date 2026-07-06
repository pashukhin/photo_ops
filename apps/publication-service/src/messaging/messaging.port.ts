export interface BusMessage {
  body: Uint8Array;
  correlationId: string;
}

export interface MessagePublisher {
  publish(destination: string, msg: BusMessage): Promise<void>;
}
