// Package usage is the provider-independent core of the usage-accounting plane:
// the consumption-event domain types and the pure logic that maps them into an
// append-only ledger and a per-user summary. It has no I/O and no external
// dependencies — adapters (pg store, amqp consumer, gRPC server) live in
// sibling packages and depend on this one, never the reverse.
package usage

import "time"

// Measurement is one raw, provider-independent consumption fact within an
// operation. Mirrors photoops.usage.v1.Measurement.
type Measurement struct {
	EventType        string
	ResourceType     string
	Quantity         int64
	Unit             string
	SourceEntityType string
	SourceEntityID   string
}

// ConsumptionEvent is a single operation's consumption, published by the
// operation's runtime and consumed by usage-service. It carries raw units +
// physical provenance (Provider, OccurredAt), never money. The whole event is
// all-or-nothing under IdempotencyKey. Mirrors photoops.usage.v1.ConsumptionEvent.
type ConsumptionEvent struct {
	IdempotencyKey string
	UserID         string
	Provider       string
	OccurredAt     time.Time
	Measurements   []Measurement
}

// BillingRow is one append-only ledger row (one per Measurement). It is the
// physical truth: raw units + provenance, no money.
type BillingRow struct {
	UserID           string
	EventType        string
	ResourceType     string
	Quantity         int64
	Unit             string
	Provider         string
	SourceEntityType string
	SourceEntityID   string
	OccurredAt       time.Time
}

// Explode maps one ConsumptionEvent into N BillingRows (one per Measurement),
// carrying the event-level user/provider/occurred_at onto each row. Pure; no I/O.
func Explode(e ConsumptionEvent) []BillingRow {
	rows := make([]BillingRow, 0, len(e.Measurements))
	for _, m := range e.Measurements {
		rows = append(rows, BillingRow{
			UserID:           e.UserID,
			EventType:        m.EventType,
			ResourceType:     m.ResourceType,
			Quantity:         m.Quantity,
			Unit:             m.Unit,
			Provider:         e.Provider,
			SourceEntityType: m.SourceEntityType,
			SourceEntityID:   m.SourceEntityID,
			OccurredAt:       e.OccurredAt,
		})
	}
	return rows
}
