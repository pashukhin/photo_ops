package usage

import (
	"context"
	"time"
)

// Reader is the application service for the read path: it fetches a user's raw
// per-resource totals from the Store and prices them via the Resolver into a
// Summary. `provider` is this instance's configured pricing context for the
// read-time estimate (single-provider in s012; multi-provider cost is a seam).
type Reader struct {
	store    Store
	resolver Resolver
	provider string
	now      func() time.Time
}

func NewReader(store Store, resolver Resolver, provider string) *Reader {
	return &Reader{store: store, resolver: resolver, provider: provider, now: time.Now}
}

// SummaryForUser returns the priced usage summary for a user.
func (r *Reader) SummaryForUser(ctx context.Context, userID string) (Summary, error) {
	panic("not implemented") // GREEN: store.SumByResource(userID) → BuildSummary(totals, provider, now, resolver)
}
