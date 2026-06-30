// Package amqp is the RabbitMQ adapter that drives the ledger from the
// usage.events stream. Topology mirrors the canonical media-path broker layout
// (durable direct exchange + DLX/DLQ); see photo-service CLAUDE.md. Covered by
// the component test against the live broker (not a unit RED).
package amqp

import (
	"context"

	"github.com/photoops/usage-service/internal/usage"
)

// Source is the logical name of the consumption-event stream.
const Source = "usage.events"

// Recorder is the port the consumer drives; *usage.Ledger satisfies it.
type Recorder interface {
	Record(ctx context.Context, e usage.ConsumptionEvent) (recorded bool, err error)
}

// Decode turns a usage.events AMQP body (a serialized
// photoops.usage.v1.ConsumptionEvent) into the domain event. GREEN: decode the
// generated proto and parse occurred_at (ISO-8601) into time.Time.
func Decode(body []byte) (usage.ConsumptionEvent, error) {
	panic("not implemented") // GREEN is the implementer's job
}

// Consumer consumes the usage.events stream and records each event. A redelivery
// is harmless: Recorder.Record is charge-once by idempotency_key.
type Consumer struct {
	rec Recorder
	// conn *amqp091.Connection // GREEN
}

func NewConsumer(rec Recorder) *Consumer {
	return &Consumer{rec: rec}
}

// Start declares the canonical topology and blocks on the consume loop. GREEN.
func (c *Consumer) Start(ctx context.Context) error {
	panic("not implemented") // GREEN is the implementer's job
}
