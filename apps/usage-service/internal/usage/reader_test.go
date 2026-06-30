package usage

import (
	"context"
	"testing"
)

func TestReaderSummaryForUser_readsThatUsersTotalsAndPricesThem(t *testing.T) {
	// why: the read path must fetch the requesting user's raw per-resource
	// totals from the store and turn them into a priced summary — the data
	// behind GetUsageSummary.
	store := newFakeStore()
	store.totals = map[string][]ResourceTotal{
		"u-1": {
			{EventType: "photo_original_stored", ResourceType: "storage", TotalQuantity: 842, Unit: "byte"},
			{EventType: "photo_processed", ResourceType: "processing", TotalQuantity: 1, Unit: "operation"},
		},
	}

	s, err := NewReader(store, StaticResolver{}, "local-demo").SummaryForUser(context.Background(), "u-1")
	if err != nil {
		t.Fatal(err)
	}
	if len(s.Lines) != 2 {
		t.Fatalf("summary must reflect the user's stored totals (2 lines), got %+v", s.Lines)
	}
	if s.Lines[0].TotalQuantity != 842 || s.Lines[0].ResourceType != "storage" {
		t.Errorf("storage line not carried through: %+v", s.Lines[0])
	}
	if s.EstimatedMonthlyCost == "" || s.Currency == "" {
		t.Errorf("summary must be priced (cost + currency), got %+v", s)
	}
}

func TestReaderSummaryForUser_unknownUserYieldsAWellFormedZeroSummary(t *testing.T) {
	// why: a user with no ledger rows must get an empty-but-priced summary
	// (no lines, a decimal "0.00"), not an error or an empty cost string.
	s, err := NewReader(newFakeStore(), StaticResolver{}, "local-demo").SummaryForUser(context.Background(), "nobody")
	if err != nil {
		t.Fatal(err)
	}
	if len(s.Lines) != 0 {
		t.Errorf("unknown user must have no lines, got %+v", s.Lines)
	}
	if s.EstimatedMonthlyCost == "" {
		t.Error("summary must still carry a decimal cost estimate")
	}
}
