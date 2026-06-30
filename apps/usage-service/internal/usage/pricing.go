package usage

import (
	"fmt"
	"math/big"
	"time"
)

// demoRateTable holds flat, time-invariant rates for the local-demo provider.
// Key: "resourceType/unit". Value: unit price as a rational number (USD per unit).
// Chosen rates:
//   - storage/byte:          $0.000000023 per byte·month  (~$23/TB·month, typical object-storage ballpark)
//   - processing/operation:  $0.000050000 per operation   (~$0.05 per photo processed)
var demoRateTable = map[string]*big.Rat{
	"storage/byte":           new(big.Rat).SetFrac(
		big.NewInt(23),
		new(big.Int).Exp(big.NewInt(10), big.NewInt(9), nil), // 23 / 1_000_000_000
	),
	"processing/operation":   new(big.Rat).SetFrac(
		big.NewInt(5),
		big.NewInt(100_000), // 5 / 100_000 = 0.00005
	),
}

// formatRat formats a *big.Rat as a decimal string with 9 significant digits.
// Used to produce the UnitPrice string for Rate.
func formatRat(r *big.Rat) string {
	// FloatString(9) gives 9 decimal places, sufficient for sub-cent per-byte pricing.
	return r.FloatString(9)
}

// formatRatFixed formats a *big.Rat as a decimal string with exactly 2 decimal places.
// Used for the final EstimatedMonthlyCost output.
func formatRatFixed(r *big.Rat) string {
	return fmt.Sprintf("%.2f", floatFromRat(r))
}

// floatFromRat converts a *big.Rat to float64. Used only for final formatting,
// not for intermediate arithmetic (which stays in big.Rat).
func floatFromRat(r *big.Rat) float64 {
	f, _ := r.Float64()
	return f
}

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
	if provider != "local-demo" {
		return Rate{}, false
	}
	key := resourceType + "/" + unit
	rat, ok := demoRateTable[key]
	if !ok {
		return Rate{}, false
	}
	return Rate{
		UnitPrice: formatRat(rat),
		Currency:  "USD",
	}, true
}
