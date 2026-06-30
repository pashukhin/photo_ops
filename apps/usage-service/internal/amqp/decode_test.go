package amqp

import (
	"testing"
	"time"

	"google.golang.org/protobuf/proto"

	pb "github.com/photoops/usage-service/internal/pb/usage/v1"
)

func TestDecode_RoundTrip(t *testing.T) {
	// Arrange: a known instant expressed as the JS toISOString() millis+Z form.
	occurredAtStr := "2025-06-15T12:34:56.789Z"
	wantTime, err := time.Parse(time.RFC3339, occurredAtStr)
	if err != nil {
		t.Fatalf("test setup: parse time: %v", err)
	}

	pbEvent := &pb.ConsumptionEvent{
		IdempotencyKey: "ikey-abc-123",
		UserId:         "user-uuid-42",
		Provider:       "local-demo",
		OccurredAt:     occurredAtStr,
		CorrelationId:  "traceparent-xyz",
		Measurements: []*pb.Measurement{
			{
				EventType:        "photo_original_stored",
				ResourceType:     "storage",
				Quantity:         1048576,
				Unit:             "byte",
				SourceEntityType: "photo",
				SourceEntityId:   "photo-uuid-1",
			},
			{
				EventType:        "photo_processed",
				ResourceType:     "processing",
				Quantity:         3,
				Unit:             "operation",
				SourceEntityType: "processing_job",
				SourceEntityId:   "job-uuid-2",
			},
		},
	}

	body, err := proto.Marshal(pbEvent)
	if err != nil {
		t.Fatalf("test setup: proto.Marshal: %v", err)
	}

	// Act
	got, err := Decode(body)
	if err != nil {
		t.Fatalf("Decode returned unexpected error: %v", err)
	}

	// Assert — top-level event fields
	if got.IdempotencyKey != "ikey-abc-123" {
		t.Errorf("IdempotencyKey: got %q, want %q", got.IdempotencyKey, "ikey-abc-123")
	}
	if got.UserID != "user-uuid-42" {
		t.Errorf("UserID: got %q, want %q", got.UserID, "user-uuid-42")
	}
	if got.Provider != "local-demo" {
		t.Errorf("Provider: got %q, want %q", got.Provider, "local-demo")
	}
	if !got.OccurredAt.Equal(wantTime) {
		t.Errorf("OccurredAt: got %v, want %v", got.OccurredAt, wantTime)
	}

	// Assert — measurements slice
	if len(got.Measurements) != 2 {
		t.Fatalf("Measurements: got %d, want 2", len(got.Measurements))
	}

	m0 := got.Measurements[0]
	if m0.EventType != "photo_original_stored" {
		t.Errorf("Measurements[0].EventType: got %q, want %q", m0.EventType, "photo_original_stored")
	}
	if m0.ResourceType != "storage" {
		t.Errorf("Measurements[0].ResourceType: got %q, want %q", m0.ResourceType, "storage")
	}
	if m0.Quantity != 1048576 {
		t.Errorf("Measurements[0].Quantity: got %d, want %d", m0.Quantity, 1048576)
	}
	if m0.Unit != "byte" {
		t.Errorf("Measurements[0].Unit: got %q, want %q", m0.Unit, "byte")
	}
	if m0.SourceEntityType != "photo" {
		t.Errorf("Measurements[0].SourceEntityType: got %q, want %q", m0.SourceEntityType, "photo")
	}
	if m0.SourceEntityID != "photo-uuid-1" {
		t.Errorf("Measurements[0].SourceEntityID: got %q, want %q", m0.SourceEntityID, "photo-uuid-1")
	}

	m1 := got.Measurements[1]
	if m1.EventType != "photo_processed" {
		t.Errorf("Measurements[1].EventType: got %q, want %q", m1.EventType, "photo_processed")
	}
	if m1.ResourceType != "processing" {
		t.Errorf("Measurements[1].ResourceType: got %q, want %q", m1.ResourceType, "processing")
	}
	if m1.Quantity != 3 {
		t.Errorf("Measurements[1].Quantity: got %d, want %d", m1.Quantity, 3)
	}
	if m1.Unit != "operation" {
		t.Errorf("Measurements[1].Unit: got %q, want %q", m1.Unit, "operation")
	}
	if m1.SourceEntityType != "processing_job" {
		t.Errorf("Measurements[1].SourceEntityType: got %q, want %q", m1.SourceEntityType, "processing_job")
	}
	if m1.SourceEntityID != "job-uuid-2" {
		t.Errorf("Measurements[1].SourceEntityID: got %q, want %q", m1.SourceEntityID, "job-uuid-2")
	}
}

func TestDecode_BadUnmarshal(t *testing.T) {
	_, err := Decode([]byte("not-proto"))
	if err == nil {
		t.Fatal("expected error for invalid proto bytes, got nil")
	}
}

func TestDecode_BadOccurredAt(t *testing.T) {
	pbEvent := &pb.ConsumptionEvent{
		IdempotencyKey: "k",
		UserId:         "u",
		Provider:       "p",
		OccurredAt:     "not-a-date",
	}
	body, _ := proto.Marshal(pbEvent)
	_, err := Decode(body)
	if err == nil {
		t.Fatal("expected error for invalid occurred_at, got nil")
	}
}
