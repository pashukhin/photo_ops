// Package amqp is the RabbitMQ adapter that drives the ledger from the
// usage.events stream. Topology mirrors the canonical media-path broker layout
// (durable direct exchange + DLX/DLQ); see photo-service CLAUDE.md. Covered by
// the component test against the live broker (not a unit RED).
package amqp

import (
	"context"
	"fmt"
	"time"

	amqp091 "github.com/rabbitmq/amqp091-go"
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

// Start declares the canonical usage.events topology and blocks on the consume
// loop until ctx is cancelled or the connection is lost.
//
// Topology for logical name N = "usage.events":
//   - exchange N               — direct, durable
//   - exchange N+".dlx"        — direct, durable
//   - queue    N+".dlq"        — durable; bound to N+".dlx" with routing key N
//   - queue    N               — durable, x-dead-letter-exchange=N+".dlx";
//     bound to exchange N with routing key N
//
// On success the delivery is acked. A decode failure (poison) is
// nacked(requeue=false) to the DLQ; a record failure (transient) is
// nacked(requeue=true) with a short backoff so a valid event is retried rather
// than dead-lettered. See classifyDelivery.
func (c *Consumer) Start(ctx context.Context) error {
	conn, err := amqp091.Dial(c.brokerURL)
	if err != nil {
		return fmt.Errorf("amqp.Consumer.Start: dial %s: %w", c.brokerURL, err)
	}
	defer func() { _ = conn.Close() }()

	ch, err := conn.Channel()
	if err != nil {
		return fmt.Errorf("amqp.Consumer.Start: open channel: %w", err)
	}
	defer func() { _ = ch.Close() }()

	if err := declareTopology(ch, Source); err != nil {
		return err
	}

	deliveries, err := ch.Consume(
		Source, // queue
		"",     // consumer tag (auto-generated)
		false,  // auto-ack — we ack/nack manually
		false,  // exclusive
		false,  // no-local
		false,  // no-wait
		nil,    // args
	)
	if err != nil {
		return fmt.Errorf("amqp.Consumer.Start: consume %s: %w", Source, err)
	}

	connClose := conn.NotifyClose(make(chan *amqp091.Error, 1))

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case amqpErr := <-connClose:
			return fmt.Errorf("amqp.Consumer.Start: connection closed: %v", amqpErr)
		case d, ok := <-deliveries:
			if !ok {
				return fmt.Errorf("amqp.Consumer.Start: deliveries channel closed")
			}
			c.handleDelivery(ctx, d, d.Body)
		}
	}
}

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

// declareTopology asserts the canonical broker layout for the given logical name.
// This must match EXACTLY what the TS publisher asserts for usage.events; any
// mismatch in durable flags or DLX args causes PRECONDITION_FAILED.
func declareTopology(ch *amqp091.Channel, name string) error {
	dlxName := name + ".dlx"
	dlqName := name + ".dlq"

	// Primary exchange
	if err := ch.ExchangeDeclare(name, "direct", true, false, false, false, nil); err != nil {
		return fmt.Errorf("amqp: declare exchange %s: %w", name, err)
	}

	// Dead-letter exchange
	if err := ch.ExchangeDeclare(dlxName, "direct", true, false, false, false, nil); err != nil {
		return fmt.Errorf("amqp: declare exchange %s: %w", dlxName, err)
	}

	// Dead-letter queue — durable, no DLX arg; bound to DLX with routing key = name (not dlqName)
	if _, err := ch.QueueDeclare(dlqName, true, false, false, false, nil); err != nil {
		return fmt.Errorf("amqp: declare queue %s: %w", dlqName, err)
	}
	if err := ch.QueueBind(dlqName, name, dlxName, false, nil); err != nil {
		return fmt.Errorf("amqp: bind %s -> %s (rk=%s): %w", dlqName, dlxName, name, err)
	}

	// Primary queue — durable, with x-dead-letter-exchange pointing to DLX
	args := amqp091.Table{
		"x-dead-letter-exchange": dlxName,
	}
	if _, err := ch.QueueDeclare(name, true, false, false, false, args); err != nil {
		return fmt.Errorf("amqp: declare queue %s: %w", name, err)
	}
	if err := ch.QueueBind(name, name, name, false, nil); err != nil {
		return fmt.Errorf("amqp: bind %s -> %s (rk=%s): %w", name, name, name, err)
	}

	return nil
}
