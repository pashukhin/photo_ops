package usage

import (
	"testing"
	"time"
)

func TestStaticResolver_knownStorageByteResolvesToADecimalRateInACurrency(t *testing.T) {
	// why: pricing must resolve a known (provider, resource_type, unit). The
	// exact demo number is incidental and intentionally NOT pinned (it is a
	// replaceable rate-table choice); the resolvability + shape is the contract.
	rate, ok := StaticResolver{}.Resolve("local-demo", "storage", "byte", time.Now())
	if !ok {
		t.Fatal("expected a rate for local-demo storage/byte")
	}
	if rate.UnitPrice == "" || rate.Currency == "" {
		t.Errorf("rate must carry a decimal unit price and a currency, got %+v", rate)
	}
}

func TestStaticResolver_unknownResourceReportsNotFound(t *testing.T) {
	// why: an unpriced (provider/resource/unit) must report ok=false, not a zero
	// rate — callers must distinguish "free" from "unpriced".
	if _, ok := (StaticResolver{}).Resolve("local-demo", "unobtanium", "byte", time.Now()); ok {
		t.Error("an unknown resource_type must not resolve")
	}
}
