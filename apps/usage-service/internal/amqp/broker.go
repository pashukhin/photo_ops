// Broker wiring for the usage.events consumer: the raw RabbitMQ connect +
// topology-declare + consume loop. These functions perform live broker I/O and
// cannot be exercised without a running RabbitMQ, so they are unit-uncoverable
// by design and verified by the live component test (`make smoke-usage`) — the
// Go analogue of cluster-service's `# pragma: no cover` broker adapters. This
// file is excluded from the unit-coverage profile in the `coverage-go` Makefile
// target; the decide-and-acknowledge LOGIC lives in consumer.go and is fully
// unit-covered. Keep only broker-I/O wiring here.
package amqp

import (
	"context"
	"fmt"

	amqp091 "github.com/rabbitmq/amqp091-go"
)

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
// Each delivery is dispatched to handleDelivery (consumer.go), which owns the
// decode/record/ack-or-requeue decision.
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
