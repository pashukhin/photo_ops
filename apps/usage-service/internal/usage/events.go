package usage

import (
	"math/big"
	"time"
)

// EventFilter is the query for the itemized usage report. Page/PageSize are
// already defaulted/clamped by the boundary (page>=1, pageSize 1..100).
type EventFilter struct {
	UserID       string
	From         *time.Time // inclusive lower bound on OccurredAt; nil = unbounded
	To           *time.Time // inclusive upper bound on OccurredAt; nil = unbounded
	ResourceType string     // exact match; "" = all
	EventType    string     // exact match; "" = all
	Page         int        // 1-based
	PageSize     int
}

// EventLine is one itemized ledger entry with its read-time resolved cost.
type EventLine struct {
	OccurredAt       time.Time
	EventType        string
	ResourceType     string
	Quantity         int64
	Unit             string
	UnitPrice        string // decimal string
	Amount           string // decimal string = quantity × unit_price (2 dp, like the summary)
	Currency         string
	SourceEntityType string
	SourceEntityID   string
}

// BuildEventLines resolves each ledger row's per-unit price and line amount
// (quantity × unit_price) using the pricing Resolver, pricing each row by ITS
// OWN provenance (row.Provider + row.OccurredAt) — itemized cost is per-event,
// not per a single configured provider. Pure; no I/O. A row whose
// (provider,resource_type,unit) is unpriced yields unit_price/amount "0.00"
// (a well-formed line, not dropped).
func BuildEventLines(rows []BillingRow, r Resolver) []EventLine {
	lines := make([]EventLine, 0, len(rows))
	for _, row := range rows {
		line := EventLine{
			OccurredAt:       row.OccurredAt,
			EventType:        row.EventType,
			ResourceType:     row.ResourceType,
			Quantity:         row.Quantity,
			Unit:             row.Unit,
			SourceEntityType: row.SourceEntityType,
			SourceEntityID:   row.SourceEntityID,
		}

		rate, ok := r.Resolve(row.Provider, row.ResourceType, row.Unit, row.OccurredAt)
		if !ok {
			line.UnitPrice = "0.00"
			line.Amount = "0.00"
			line.Currency = "USD"
		} else {
			line.UnitPrice = rate.UnitPrice
			line.Currency = rate.Currency

			unitRate := new(big.Rat)
			unitRate.SetString(rate.UnitPrice) //nolint:errcheck // formatRat always produces a valid decimal
			amount := new(big.Rat).Mul(unitRate, new(big.Rat).SetInt64(row.Quantity))
			line.Amount = formatRatFixed(amount)
		}

		lines = append(lines, line)
	}
	return lines
}
