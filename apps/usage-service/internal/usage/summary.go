package usage

import (
	"math/big"
	"time"
)

// Summary is the per-user usage rollup returned by GetUsageSummary: raw
// per-resource lines (the §3.10 dashboard quantities) + an estimated monthly
// cost resolved from the pricing layer.
type Summary struct {
	Lines                []ResourceTotal
	EstimatedMonthlyCost string // decimal string, e.g. "0.37"
	Currency             string
}

// BuildSummary turns raw per-resource totals into the dashboard summary,
// resolving an estimated monthly cost via the pricing Resolver for the given
// provider at time `at`. Pure over its inputs (totals are fetched by the
// caller); no I/O. Raw line quantities pass through unchanged — money lives only
// in EstimatedMonthlyCost.
func BuildSummary(totals []ResourceTotal, provider string, at time.Time, r Resolver) Summary {
	total := new(big.Rat) // accumulates estimated monthly cost; stays zero if no priced lines

	for _, line := range totals {
		rate, ok := r.Resolve(provider, line.ResourceType, line.Unit, at)
		if !ok {
			continue // unpriced lines are skipped, not treated as free
		}
		unitRate := new(big.Rat)
		unitRate.SetString(rate.UnitPrice) // formatRat always produces a valid decimal
		lineTotal := new(big.Rat).Mul(unitRate, new(big.Rat).SetInt64(line.TotalQuantity))
		total.Add(total, lineTotal)
	}

	return Summary{
		Lines:                totals,
		EstimatedMonthlyCost: formatRatFixed(total),
		Currency:             "USD",
	}
}
