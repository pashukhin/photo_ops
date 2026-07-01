package usage

import (
	"testing"
	"time"
)

func TestExplode_mapsEachMeasurementToARowInheritingEventProvenance(t *testing.T) {
	// why: one operation with several resources must become one append-only
	// ledger row per measurement, each inheriting the event's
	// user/provider/occurred_at. This raw-unit mapping is the heart of the
	// cross-service contract.
	at := time.Date(2026, 6, 30, 12, 0, 0, 0, time.UTC)
	e := ConsumptionEvent{
		IdempotencyKey: "job-1",
		UserID:         "u-1",
		Provider:       "local-demo",
		OccurredAt:     at,
		Measurements: []Measurement{
			{EventType: "photo_variant_generated", ResourceType: "storage", Quantity: 1200, Unit: "byte", SourceEntityType: "photo_variant", SourceEntityID: "v-1"},
			{EventType: "photo_processed", ResourceType: "processing", Quantity: 1, Unit: "operation", SourceEntityType: "processing_job", SourceEntityID: "job-1"},
		},
	}

	rows := Explode(e)

	if len(rows) != 2 {
		t.Fatalf("want one row per measurement (2), got %d", len(rows))
	}
	if rows[0].UserID != "u-1" || rows[0].Provider != "local-demo" || !rows[0].OccurredAt.Equal(at) {
		t.Errorf("row[0] did not inherit event provenance: %+v", rows[0])
	}
	if rows[0].EventType != "photo_variant_generated" || rows[0].ResourceType != "storage" || rows[0].Quantity != 1200 || rows[0].Unit != "byte" {
		t.Errorf("row[0] measurement fields wrong: %+v", rows[0])
	}
	if rows[0].SourceEntityType != "photo_variant" || rows[0].SourceEntityID != "v-1" {
		t.Errorf("row[0] source attribution wrong: %+v", rows[0])
	}
	if rows[1].EventType != "photo_processed" || rows[1].ResourceType != "processing" || rows[1].Quantity != 1 || rows[1].SourceEntityID != "job-1" {
		t.Errorf("row[1] measurement fields wrong: %+v", rows[1])
	}
}

func TestExplode_emptyMeasurementsYieldsNoRows(t *testing.T) {
	// why: an event with no measurements must not fabricate ledger rows.
	rows := Explode(ConsumptionEvent{IdempotencyKey: "k", UserID: "u-1", Provider: "local-demo", OccurredAt: time.Now()})
	if len(rows) != 0 {
		t.Fatalf("want 0 rows for an empty event, got %d", len(rows))
	}
}
