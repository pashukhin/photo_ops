package usage

import "context"

// ResourceTotal is an aggregate ledger rollup line for one
// (event_type, resource_type) of a user.
type ResourceTotal struct {
	EventType     string
	ResourceType  string
	TotalQuantity int64
	Unit          string
}

// Store is the persistence port for the ledger. The pg adapter implements it;
// unit tests use an in-memory fake. It keeps the charge-once primitive atomic:
// RecordOnce writes the inbox key and the ledger rows in ONE transaction.
type Store interface {
	// RecordOnce inserts key into the inbox and rows into the append-only ledger
	// atomically. recorded is true if the key was new (rows written); false on
	// replay (key already present → nothing written).
	RecordOnce(ctx context.Context, key string, rows []BillingRow) (recorded bool, err error)
	// SumByResource returns the per-(event_type, resource_type) totals for a user.
	SumByResource(ctx context.Context, userID string) ([]ResourceTotal, error)
}

// Ledger records consumption events into an append-only store with charge-once
// semantics. It is the application service behind the AMQP consumer.
type Ledger struct {
	store Store
}

func NewLedger(store Store) *Ledger {
	return &Ledger{store: store}
}

// Record explodes the event into ledger rows and writes them once under the
// event's idempotency_key. A replay of the same key is a no-op
// (recorded=false). All-or-nothing under the key.
func (l *Ledger) Record(ctx context.Context, e ConsumptionEvent) (recorded bool, err error) {
	rows := Explode(e)
	return l.store.RecordOnce(ctx, e.IdempotencyKey, rows)
}
