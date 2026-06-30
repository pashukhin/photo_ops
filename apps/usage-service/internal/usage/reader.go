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
	totals, err := r.store.SumByResource(ctx, userID)
	if err != nil {
		return Summary{}, err
	}
	return BuildSummary(totals, r.provider, r.now(), r.resolver), nil
}

// EventReport is the itemized usage report for one filtered page.
type EventReport struct {
	Lines               []EventLine
	TotalCount          int    // rows matching the filter, ignoring pagination
	FilteredTotalAmount string // decimal string: summed cost over the WHOLE filter
	Currency            string
}

// EventsForUser returns one filtered, paginated page of itemized usage lines
// (each priced by its own provenance) plus the cost total over the whole filter.
func (r *Reader) EventsForUser(ctx context.Context, filter EventFilter) (EventReport, error) {
	rows, totalCount, err := r.store.ListEvents(ctx, filter)
	if err != nil {
		return EventReport{}, err
	}

	totals, err := r.store.SumByResourceFiltered(ctx, filter)
	if err != nil {
		return EventReport{}, err
	}

	summary := BuildSummary(totals, r.provider, r.now(), r.resolver)

	return EventReport{
		Lines:               BuildEventLines(rows, r.resolver),
		TotalCount:          totalCount,
		FilteredTotalAmount: summary.EstimatedMonthlyCost,
		Currency:            summary.Currency,
	}, nil
}
