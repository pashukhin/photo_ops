import { join } from 'path';
import * as protobuf from 'protobufjs';

// Wire format for the usage.events consumption stream. Runtime-protobufjs
// against the usage/v1/consumption.proto contract (mirrors photo-service's
// usage.codec). protobufjs exposes fields in camelCase.
const protoPath = join(process.cwd(), '../../proto/usage/v1/consumption.proto');
const root = protobuf.loadSync(protoPath);
const ConsumptionEventType = root.lookupType('photoops.usage.v1.ConsumptionEvent');

export interface MeasurementInput {
  eventType: string;
  resourceType: string;
  quantity: number;
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
  const message = ConsumptionEventType.fromObject({
    idempotencyKey: event.idempotencyKey,
    userId: event.userId,
    provider: event.provider,
    occurredAt: event.occurredAt,
    measurements: event.measurements.map((m) => ({
      eventType: m.eventType,
      resourceType: m.resourceType,
      quantity: m.quantity,
      unit: m.unit,
      sourceEntityType: m.sourceEntityType,
      sourceEntityId: m.sourceEntityId
    })),
    correlationId: event.correlationId
  });
  return ConsumptionEventType.encode(message).finish();
}
