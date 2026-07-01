package usage

import (
	"context"
	"testing"
	"time"
)

// fakeStore is an in-memory Store: a map-based inbox + an appended row slice,
// mirroring the pg inbox/ledger so the charge-once orchestration can be unit
// tested without a database. The pg adapter's equivalent SQL is covered by the
// component test against the live stack.
type fakeStore struct {
	seen   map[string]bool
	rows   []BillingRow
	totals map[string][]ResourceTotal // per-user aggregates returned by SumByResource
	// ListEvents / SumByResourceFiltered fixtures (report path):
	listRows       []BillingRow
	listTotalCount int
	filteredTotals []ResourceTotal
}

func newFakeStore() *fakeStore { return &fakeStore{seen: map[string]bool{}} }

func (f *fakeStore) RecordOnce(_ context.Context, key string, rows []BillingRow) (bool, error) {
	if f.seen[key] {
		return false, nil
	}
	f.seen[key] = true
	f.rows = append(f.rows, rows...)
	return true, nil
}

func (f *fakeStore) SumByResource(_ context.Context, userID string) ([]ResourceTotal, error) {
	return f.totals[userID], nil
}

func (f *fakeStore) ListEvents(_ context.Context, _ EventFilter) ([]BillingRow, int, error) {
	return f.listRows, f.listTotalCount, nil
}

func (f *fakeStore) SumByResourceFiltered(_ context.Context, _ EventFilter) ([]ResourceTotal, error) {
	return f.filteredTotals, nil
}

func sampleEvent(key string) ConsumptionEvent {
	return ConsumptionEvent{
		IdempotencyKey: key,
		UserID:         "00000000-0000-7000-8000-000000000001",
		Provider:       "local-demo",
		OccurredAt:     time.Date(2026, 6, 30, 12, 0, 0, 0, time.UTC),
		Measurements: []Measurement{
			{EventType: "photo_original_stored", ResourceType: "storage", Quantity: 842, Unit: "byte", SourceEntityType: "photo", SourceEntityID: "00000000-0000-7000-8000-0000000000aa"},
		},
	}
}

func TestLedgerRecord_freshEventAppendsOneRowPerMeasurement(t *testing.T) {
	// why: a fresh event must append its measurements to the append-only ledger
	// and report recorded=true.
	store := newFakeStore()
	recorded, err := NewLedger(store).Record(context.Background(), sampleEvent("k1"))
	if err != nil {
		t.Fatal(err)
	}
	if !recorded {
		t.Error("first Record of a key must report recorded=true")
	}
	if len(store.rows) != 1 {
		t.Fatalf("want 1 appended ledger row, got %d", len(store.rows))
	}
}

func TestLedgerRecord_replayOfSameKeyWritesNothing(t *testing.T) {
	// why: charge-once over an at-least-once broker — replaying the same
	// idempotency_key must not duplicate ledger rows and must report recorded=false.
	store := newFakeStore()
	l := NewLedger(store)
	if _, err := l.Record(context.Background(), sampleEvent("k1")); err != nil {
		t.Fatal(err)
	}
	recorded, err := l.Record(context.Background(), sampleEvent("k1"))
	if err != nil {
		t.Fatal(err)
	}
	if recorded {
		t.Error("replay of an already-seen key must report recorded=false")
	}
	if len(store.rows) != 1 {
		t.Errorf("replay must not duplicate ledger rows; want 1, got %d", len(store.rows))
	}
}
