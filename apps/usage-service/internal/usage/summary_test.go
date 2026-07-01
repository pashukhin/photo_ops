package usage

import (
	"testing"
	"time"
)

func TestBuildSummary_passesRawLinesThroughAndPricesInACurrency(t *testing.T) {
	// why: the summary must surface raw per-resource totals UNCHANGED (the
	// dashboard's "Original storage: 842 bytes", "Photos processed: 1") and
	// attach a decimal monthly-cost estimate in a currency from the pricing
	// layer. The exact cost formula is a pricing seam and is not pinned here.
	totals := []ResourceTotal{
		{EventType: "photo_original_stored", ResourceType: "storage", TotalQuantity: 842, Unit: "byte"},
		{EventType: "photo_processed", ResourceType: "processing", TotalQuantity: 1, Unit: "operation"},
	}

	s := BuildSummary(totals, "local-demo", time.Now(), StaticResolver{})

	if len(s.Lines) != 2 {
		t.Fatalf("raw lines must pass through unchanged, want 2 got %d", len(s.Lines))
	}
	if s.Lines[0].TotalQuantity != 842 || s.Lines[0].ResourceType != "storage" {
		t.Errorf("storage line altered: %+v", s.Lines[0])
	}
	if s.EstimatedMonthlyCost == "" || s.Currency == "" {
		t.Errorf("summary must carry a decimal cost estimate + currency, got %+v", s)
	}
}

func TestBuildSummary_noUsageEstimatesZeroNotEmpty(t *testing.T) {
	// why: a user with no usage must get a well-formed zero estimate, not an
	// empty string — the dashboard always shows a number.
	s := BuildSummary(nil, "local-demo", time.Now(), StaticResolver{})
	if s.EstimatedMonthlyCost == "" {
		t.Error("empty usage must still produce a decimal cost (e.g. \"0.00\")")
	}
}
