package amqp

import (
	"context"
	"errors"
	"testing"
	"time"

	"google.golang.org/protobuf/proto"

	pb "github.com/photoops/usage-service/internal/pb/usage/v1"
	"github.com/photoops/usage-service/internal/usage"
)

// fakeRecorder is a test double for the Recorder port.
type fakeRecorder struct {
	recorded bool
	err      error
	calls    int
}

func (f *fakeRecorder) Record(_ context.Context, _ usage.ConsumptionEvent) (bool, error) {
	f.calls++
	return f.recorded, f.err
}

// validBody returns a marshaled ConsumptionEvent that Decode accepts.
func validBody(t *testing.T) []byte {
	t.Helper()
	b, err := proto.Marshal(&pb.ConsumptionEvent{
		IdempotencyKey: "k1",
		UserId:         "u1",
		Provider:       "local-demo",
		OccurredAt:     "2025-06-15T12:34:56.789Z",
		Measurements: []*pb.Measurement{
			{EventType: "photo_processed", ResourceType: "processing", Quantity: 1, Unit: "operation"},
		},
	})
	if err != nil {
		t.Fatalf("test setup: marshal: %v", err)
	}
	return b
}

func TestClassifyDelivery_Recorded_Acks(t *testing.T) {
	c := NewConsumer(&fakeRecorder{recorded: true}, "")
	if got := c.classifyDelivery(context.Background(), validBody(t)); got != outcomeAck {
		t.Fatalf("recorded event must ack: want %v, got %v", outcomeAck, got)
	}
}

func TestClassifyDelivery_TransientRecordError_Requeues(t *testing.T) {
	// A transient Record failure (DB restart/deadlock/cancelled ctx) must be
	// requeued for retry, NOT dead-lettered — else a valid billing event is
	// silently lost on a brief usage-db blip (photo_ops-35w).
	c := NewConsumer(&fakeRecorder{err: errors.New("db unavailable")}, "")
	if got := c.classifyDelivery(context.Background(), validBody(t)); got != outcomeRequeue {
		t.Fatalf("transient record error must requeue: want %v, got %v", outcomeRequeue, got)
	}
}

// fakeDelivery records the ack/nack action taken.
type fakeDelivery struct {
	acked       bool
	nackCalled  bool
	nackRequeue bool
}

func (f *fakeDelivery) Ack(_ bool) error { f.acked = true; return nil }
func (f *fakeDelivery) Nack(_, requeue bool) error {
	f.nackCalled = true
	f.nackRequeue = requeue
	return nil
}

func TestHandleDelivery_Recorded_Acks(t *testing.T) {
	c := NewConsumer(&fakeRecorder{recorded: true}, "")
	d := &fakeDelivery{}
	c.handleDelivery(context.Background(), d, validBody(t))
	if !d.acked || d.nackCalled {
		t.Fatalf("recorded event must ack and not nack: %+v", d)
	}
}

func TestHandleDelivery_TransientRecordError_NacksRequeue(t *testing.T) {
	// Cancelled ctx so the post-requeue backoff returns immediately.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	c := NewConsumer(&fakeRecorder{err: errors.New("db unavailable")}, "")
	d := &fakeDelivery{}
	c.handleDelivery(ctx, d, validBody(t))
	if d.acked || !d.nackCalled || !d.nackRequeue {
		t.Fatalf("transient error must nack with requeue=true: %+v", d)
	}
}

func TestHandleDelivery_TransientRecordError_BackoffElapses(t *testing.T) {
	// Non-cancelled ctx with a tiny backoff exercises the timer branch of the
	// post-requeue throttle (the sustained-outage path).
	c := NewConsumer(&fakeRecorder{err: errors.New("db unavailable")}, "")
	c.backoff = time.Millisecond
	d := &fakeDelivery{}
	c.handleDelivery(context.Background(), d, validBody(t))
	if !d.nackCalled || !d.nackRequeue {
		t.Fatalf("transient error must nack with requeue=true: %+v", d)
	}
}

func TestHandleDelivery_Poison_NacksDeadLetter(t *testing.T) {
	c := NewConsumer(&fakeRecorder{}, "")
	d := &fakeDelivery{}
	c.handleDelivery(context.Background(), d, []byte{0xff, 0xff, 0xff})
	if d.acked || !d.nackCalled || d.nackRequeue {
		t.Fatalf("poison must nack with requeue=false (dead-letter): %+v", d)
	}
}

func TestClassifyDelivery_UndecodableBody_DeadLetters(t *testing.T) {
	// A poison message (undecodable) can never succeed on retry, so it must
	// dead-letter rather than requeue-loop forever.
	rec := &fakeRecorder{}
	c := NewConsumer(rec, "")
	if got := c.classifyDelivery(context.Background(), []byte{0xff, 0xff, 0xff}); got != outcomeDLQ {
		t.Fatalf("undecodable body must dead-letter: want %v, got %v", outcomeDLQ, got)
	}
	if rec.calls != 0 {
		t.Fatalf("poison must not reach the recorder: got %d calls", rec.calls)
	}
}
