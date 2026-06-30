package usage

import "time"

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
	panic("not implemented") // GREEN is the implementer's job
}
