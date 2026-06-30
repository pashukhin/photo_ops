package usage

import "time"

// Rate is the unit price for a (provider, resource_type, unit) at a point in
// time, as a decimal string (money is never a float).
type Rate struct {
	UnitPrice string // decimal string: price per one `unit`
	Currency  string // e.g. "USD"
}

// Resolver maps raw consumption to a unit price. It is the ONLY place money
// enters the system. occurred_at selects the rate effective then; provider
// selects whose tariff applies — so two instances of the same service on
// different providers, or the same provider at different times, price
// correctly. Designed to be lifted into a separate pricing-service later
// without changing callers or the ledger. See ADR-0004.
type Resolver interface {
	// Resolve reports the rate for the given raw consumption, or ok=false if
	// the (provider, resource_type, unit) is unpriced (distinct from "free").
	Resolve(provider, resourceType, unit string, at time.Time) (rate Rate, ok bool)
}

// StaticResolver is the session-012 demo resolver: a single provider with flat,
// time-invariant rates. Versioned / multi-provider rate cards, region/SKU, and
// an extracted pricing-service are seams (see ADR-0003 non-goals).
type StaticResolver struct{}

func (StaticResolver) Resolve(provider, resourceType, unit string, at time.Time) (Rate, bool) {
	panic("not implemented") // GREEN is the implementer's job
}
