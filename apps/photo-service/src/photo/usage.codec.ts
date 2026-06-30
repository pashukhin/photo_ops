import { join } from 'path';
import * as protobuf from 'protobufjs';

// Wire format for the usage.events consumption stream. Mirrors the
// processing.codec runtime-protobufjs approach: the schema is the
// usage/v1/consumption.proto contract, serialized at runtime. protobufjs
// exposes fields in camelCase.
const protoPath = join(process.cwd(), '../../proto/usage/v1/consumption.proto');
const root = protobuf.loadSync(protoPath);
const ConsumptionEventType = root.lookupType('photoops.usage.v1.ConsumptionEvent');

export interface MeasurementInput {
  eventType: string;
  resourceType: string;
  quantity: number; // bytes / counts; safe < 2^53 for personal scale (large-scale → string/Long is a seam)
  unit: string;
  sourceEntityType: string;
  sourceEntityId: string;
}

export interface ConsumptionEventInput {
  idempotencyKey: string;
  userId: string;
  provider: string;
  occurredAt: string; // ISO-8601 instant
  measurements: MeasurementInput[];
  correlationId: string;
}

export function encodeConsumptionEvent(event: ConsumptionEventInput): Uint8Array {
  // GREEN: ConsumptionEventType.encode(ConsumptionEventType.fromObject({ ...event })).finish()
  void ConsumptionEventType;
  void event;
  throw new Error('not implemented'); // GREEN is the implementer's job
}
