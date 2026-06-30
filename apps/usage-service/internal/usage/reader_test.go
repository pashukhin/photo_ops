package usage

import (
	"context"
	"testing"
	"time"
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

func TestReaderEventsForUser_pricedPageLinesPlusFilteredTotal(t *testing.T) {
	// why: the report path returns priced itemized lines for the page plus the
	// cost total over the WHOLE filter (and the count ignoring pagination).
	at := time.Date(2026, 6, 30, 12, 0, 0, 0, time.UTC)
	store := newFakeStore()
	store.listRows = []BillingRow{
		{UserID: "u-1", EventType: "photo_original_stored", ResourceType: "storage", Quantity: 5_000_000, Unit: "byte", Provider: "local-demo", SourceEntityType: "photo", SourceEntityID: "p-1", OccurredAt: at},
	}
	store.listTotalCount = 7 // more rows match than fit on the page
	store.filteredTotals = []ResourceTotal{
		{EventType: "photo_original_stored", ResourceType: "storage", TotalQuantity: 5_000_000, Unit: "byte"},
	}

	rep, err := NewReader(store, StaticResolver{}, "local-demo").
		EventsForUser(context.Background(), EventFilter{UserID: "u-1", Page: 1, PageSize: 25})
	if err != nil {
		t.Fatal(err)
	}
	if len(rep.Lines) != 1 || rep.Lines[0].Quantity != 5_000_000 {
		t.Fatalf("expected one priced line for the page, got %+v", rep.Lines)
	}
	if rep.TotalCount != 7 {
		t.Errorf("total_count must reflect the full filter (7), got %d", rep.TotalCount)
	}
	if rep.FilteredTotalAmount == "" || rep.Currency == "" {
		t.Errorf("filtered total amount + currency must be set, got %+v", rep)
	}
}
