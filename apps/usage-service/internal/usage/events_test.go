package usage

import (
	"math/big"
	"testing"
	"time"
)

func TestBuildEventLines_pricesEachRowByItsOwnProvenance(t *testing.T) {
	// why: each itemized line resolves its cost from the ROW's own provider +
	// occurred_at (per-event provenance), and amount = quantity × unit_price.
	at := time.Date(2026, 6, 30, 12, 0, 0, 0, time.UTC)
	rows := []BillingRow{
		{UserID: "u-1", EventType: "photo_original_stored", ResourceType: "storage", Quantity: 5_000_000, Unit: "byte", Provider: "local-demo", SourceEntityType: "photo", SourceEntityID: "p-1", OccurredAt: at},
	}

	lines := BuildEventLines(rows, StaticResolver{})

	if len(lines) != 1 {
		t.Fatalf("want one line per row, got %d", len(lines))
	}
	l := lines[0]
	if l.EventType != "photo_original_stored" || l.ResourceType != "storage" || l.Quantity != 5_000_000 || l.Unit != "byte" {
		t.Errorf("row fields not carried through: %+v", l)
	}
	if !l.OccurredAt.Equal(at) || l.SourceEntityType != "photo" || l.SourceEntityID != "p-1" {
		t.Errorf("provenance/attribution not carried: %+v", l)
	}
	if l.UnitPrice == "" || l.Currency != "USD" {
		t.Errorf("price/currency must be resolved: %+v", l)
	}
	// 5 MB of storage at a realistic rate exceeds a cent → a positive amount.
	amt, ok := new(big.Rat).SetString(l.Amount)
	if !ok || amt.Sign() <= 0 {
		t.Errorf("amount must be a positive decimal for 5MB storage, got %q", l.Amount)
	}
}

func TestBuildEventLines_unpricedRowYieldsWellFormedZeroAmountLine(t *testing.T) {
	// why: a row whose (provider,resource,unit) is unpriced must still produce a
	// well-formed line with a decimal amount (e.g. "0.00") — not be dropped.
	rows := []BillingRow{
		{UserID: "u-1", EventType: "x", ResourceType: "unobtanium", Quantity: 10, Unit: "byte", Provider: "local-demo", OccurredAt: time.Now()},
	}

	lines := BuildEventLines(rows, StaticResolver{})

	if len(lines) != 1 {
		t.Fatalf("unpriced row must still yield a line, got %d", len(lines))
	}
	if lines[0].Amount == "" || lines[0].Currency == "" {
		t.Errorf("unpriced line must carry a formatted amount + currency, got %+v", lines[0])
	}
}
