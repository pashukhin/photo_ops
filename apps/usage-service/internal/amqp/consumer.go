// Package amqp is the RabbitMQ adapter that drives the ledger from the
// usage.events stream. Topology mirrors the canonical media-path broker layout
// (durable direct exchange + DLX/DLQ); see photo-service CLAUDE.md. Covered by
// the component test against the live broker (not a unit RED).
package amqp

import (
	"context"
	"fmt"
	"time"

	"google.golang.org/protobuf/proto"

	pb "github.com/photoops/usage-service/internal/pb/usage/v1"
	"github.com/photoops/usage-service/internal/usage"
)

// Source is the logical name of the consumption-event stream.
const Source = "usage.events"

// requeueBackoff throttles redelivery after a transient record failure so a
// sustained usage-db outage does not spin the consume loop hot.
const requeueBackoff = 1 * time.Second

// deliveryOutcome is the queue action the consumer takes for one delivery.
type deliveryOutcome int

const (
	// outcomeAck — the event was recorded (or is a charge-once replay); drop it.
	outcomeAck deliveryOutcome = iota
	// outcomeDLQ — the body is poison (undecodable); retrying can never help, so
	// dead-letter it.
	outcomeDLQ
	// outcomeRequeue — a transient failure (DB unavailable, deadlock, ctx
	// cancelled at shutdown); requeue so the valid event is retried instead of
	// being silently dead-lettered.
	outcomeRequeue
)

// Recorder is the port the consumer drives; *usage.Ledger satisfies it.
type Recorder interface {
	Record(ctx context.Context, e usage.ConsumptionEvent) (recorded bool, err error)
}

// Decode turns a usage.events AMQP body (a serialized
// photoops.usage.v1.ConsumptionEvent) into the domain event. GREEN: decode the
// generated proto and parse occurred_at (ISO-8601) into time.Time.
func Decode(body []byte) (usage.ConsumptionEvent, error) {
	var pbEvent pb.ConsumptionEvent
	if err := proto.Unmarshal(body, &pbEvent); err != nil {
		return usage.ConsumptionEvent{}, fmt.Errorf("amqp.Decode: unmarshal: %w", err)
	}

	occurredAt, err := time.Parse(time.RFC3339, pbEvent.GetOccurredAt())
	if err != nil {
		return usage.ConsumptionEvent{}, fmt.Errorf("amqp.Decode: parse occurred_at %q: %w", pbEvent.GetOccurredAt(), err)
	}

	pbMs := pbEvent.GetMeasurements()
	ms := make([]usage.Measurement, 0, len(pbMs))
	for _, m := range pbMs {
		ms = append(ms, usage.Measurement{
			EventType:        m.GetEventType(),
			ResourceType:     m.GetResourceType(),
			Quantity:         m.GetQuantity(),
			Unit:             m.GetUnit(),
			SourceEntityType: m.GetSourceEntityType(),
			SourceEntityID:   m.GetSourceEntityId(),
		})
	}

	return usage.ConsumptionEvent{
		IdempotencyKey: pbEvent.GetIdempotencyKey(),
		UserID:         pbEvent.GetUserId(),
		Provider:       pbEvent.GetProvider(),
		OccurredAt:     occurredAt,
		Measurements:   ms,
	}, nil
}

// Consumer consumes the usage.events stream and records each event. A redelivery
// is harmless: Recorder.Record is charge-once by idempotency_key.
type Consumer struct {
	rec       Recorder
	brokerURL string
	// backoff throttles redelivery after a transient failure; injectable so the
	// timer branch is unit-testable without a real 1s wait.
	backoff time.Duration
}

// NewConsumer constructs a Consumer. brokerURL is the AMQP connection string,
// e.g. "amqp://guest:guest@localhost:5672/". Task 5 wires this from config.
func NewConsumer(rec Recorder, brokerURL string) *Consumer {
	return &Consumer{rec: rec, brokerURL: brokerURL, backoff: requeueBackoff}
}

// The broker wiring — Consumer.Start (connect + consume loop) and
// declareTopology — lives in broker.go (unit-uncoverable live I/O, smoke-covered).

// acknowledger is the subset of amqp091.Delivery the dispatch needs. A real
// Delivery satisfies it (value-receiver Ack/Nack); a fake drives the unit test.
type acknowledger interface {
	Ack(multiple bool) error
	Nack(multiple, requeue bool) error
}

// handleDelivery decodes+records one delivery and applies the queue action.
// Separated from Start (raw broker wiring, live-smoke covered) so the whole
// decide-and-acknowledge path is unit-testable with a fake delivery.
func (c *Consumer) handleDelivery(ctx context.Context, ack acknowledger, body []byte) {
	switch c.classifyDelivery(ctx, body) {
	case outcomeAck:
		_ = ack.Ack(false)
	case outcomeRequeue:
		_ = ack.Nack(false, true) // transient — requeue for retry
		// Throttle so a sustained outage does not hot-loop. Full
		// reconnect/supervision is tracked in photo_ops-03x.
		select {
		case <-ctx.Done():
		case <-time.After(c.backoff):
		}
	default: // outcomeDLQ
		_ = ack.Nack(false, false) // poison — dead-letter, don't requeue
	}
}

// classifyDelivery decodes and records one delivery, returning the queue action
// to take. A decode failure is poison (DLQ — retrying can never help); a record
// failure is transient (requeue — the valid event must be retried, not lost).
func (c *Consumer) classifyDelivery(ctx context.Context, body []byte) deliveryOutcome {
	event, err := Decode(body)
	if err != nil {
		return outcomeDLQ
	}
	if _, err := c.rec.Record(ctx, event); err != nil {
		return outcomeRequeue
	}
	return outcomeAck
}
