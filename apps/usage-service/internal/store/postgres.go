// Package store is the pgxpool-backed adapter for usage.Store. Its SQL is
// covered by the component test against the live stack (not a unit RED) — the
// charge-once primitive is one transaction: INSERT processed_events ON CONFLICT
// DO NOTHING; iff inserted, INSERT the billing_events rows.
package store

import (
	"context"

	"github.com/photoops/usage-service/internal/usage"
)

// PostgresStore implements usage.Store over usage-db. GREEN: add a
// *pgxpool.Pool field, a constructor, and the SQL bodies.
type PostgresStore struct {
	// pool *pgxpool.Pool // GREEN
}

// Compile-time contract pin: PostgresStore must satisfy usage.Store.
var _ usage.Store = (*PostgresStore)(nil)

func (s *PostgresStore) RecordOnce(ctx context.Context, key string, rows []usage.BillingRow) (bool, error) {
	panic("not implemented") // GREEN: one tx — inbox ON CONFLICT DO NOTHING, then ledger rows iff new
}

func (s *PostgresStore) SumByResource(ctx context.Context, userID string) ([]usage.ResourceTotal, error) {
	panic("not implemented") // GREEN: SELECT … GROUP BY event_type, resource_type, unit WHERE user_id = $1
}
