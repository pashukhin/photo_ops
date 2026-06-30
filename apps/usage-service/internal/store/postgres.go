// Package store is the pgxpool-backed adapter for usage.Store. Its SQL is
// covered by the component test against the live stack (not a unit RED) — the
// charge-once primitive is one transaction: INSERT processed_events ON CONFLICT
// DO NOTHING; iff inserted, INSERT the billing_events rows.
package store

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/photoops/usage-service/internal/usage"
)

// PostgresStore implements usage.Store over usage-db via a pgxpool connection pool.
type PostgresStore struct {
	pool *pgxpool.Pool
}

// NewPostgresStore returns a PostgresStore backed by the given pool.
func NewPostgresStore(pool *pgxpool.Pool) *PostgresStore {
	return &PostgresStore{pool: pool}
}

// Compile-time contract pin: PostgresStore must satisfy usage.Store.
var _ usage.Store = (*PostgresStore)(nil)

// uuidParam converts a canonical UUID string into a pgtype.UUID, which pgx v5
// encodes correctly in binary/extended protocol. Plain Go strings are NOT
// accepted for uuid-OID columns under pgx v5 binary mode.
func uuidParam(s string) (pgtype.UUID, error) {
	var u pgtype.UUID
	if err := u.Scan(s); err != nil {
		return u, fmt.Errorf("invalid uuid %q: %w", s, err)
	}
	return u, nil
}

// RecordOnce implements charge-once semantics in a single transaction:
//  1. INSERT INTO processed_events (idempotency_key) … ON CONFLICT DO NOTHING.
//  2. If RowsAffected == 0 → replay: commit (no-op) and return (false, nil).
//  3. If RowsAffected == 1 → INSERT each row into billing_events, then commit
//     and return (true, nil).
//
// On any error the transaction is rolled back. billing_events is APPEND-ONLY:
// only INSERTs are performed — never UPDATE or DELETE.
func (s *PostgresStore) RecordOnce(ctx context.Context, key string, rows []usage.BillingRow) (bool, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, fmt.Errorf("store.RecordOnce: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // best-effort rollback; commit path returns first

	// Step 1: try to claim the idempotency key.
	tag, err := tx.Exec(ctx,
		`INSERT INTO processed_events (idempotency_key) VALUES ($1) ON CONFLICT DO NOTHING`,
		key,
	)
	if err != nil {
		return false, fmt.Errorf("store.RecordOnce: insert processed_events: %w", err)
	}

	// Step 2: replay — key already present, nothing to write.
	if tag.RowsAffected() == 0 {
		if err := tx.Commit(ctx); err != nil {
			return false, fmt.Errorf("store.RecordOnce: commit (replay): %w", err)
		}
		return false, nil
	}

	// Step 3: new key — insert one billing_events row per BillingRow.
	for i := range rows {
		id, err := uuid.NewV7()
		if err != nil {
			return false, fmt.Errorf("store.RecordOnce: generate uuid v7 for row %d: %w", i, err)
		}

		r := &rows[i]

		userIDParam, err := uuidParam(r.UserID)
		if err != nil {
			return false, fmt.Errorf("store.RecordOnce: row %d user_id: %w", i, err)
		}
		sourceEntityIDParam, err := uuidParam(r.SourceEntityID)
		if err != nil {
			return false, fmt.Errorf("store.RecordOnce: row %d source_entity_id: %w", i, err)
		}

		_, err = tx.Exec(ctx,
			`INSERT INTO billing_events
				(id, user_id, event_type, resource_type, quantity, unit,
				 provider, source_entity_type, source_entity_id, occurred_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
			pgtype.UUID{Bytes: id, Valid: true},
			userIDParam,
			r.EventType,
			r.ResourceType,
			r.Quantity,
			r.Unit,
			r.Provider,
			r.SourceEntityType,
			sourceEntityIDParam,
			r.OccurredAt,
		)
		if err != nil {
			return false, fmt.Errorf("store.RecordOnce: insert billing_events row %d: %w", i, err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return false, fmt.Errorf("store.RecordOnce: commit: %w", err)
	}
	return true, nil
}

// SumByResource returns per-(event_type, resource_type, unit) quantity totals
// for the given userID, ordered by event_type and resource_type.
func (s *PostgresStore) SumByResource(ctx context.Context, userID string) ([]usage.ResourceTotal, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT event_type, resource_type, SUM(quantity)::bigint, unit
		 FROM billing_events
		 WHERE user_id = $1
		 GROUP BY event_type, resource_type, unit
		 ORDER BY event_type, resource_type`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("store.SumByResource: query: %w", err)
	}
	defer rows.Close()

	var totals []usage.ResourceTotal
	for rows.Next() {
		var t usage.ResourceTotal
		if err := rows.Scan(&t.EventType, &t.ResourceType, &t.TotalQuantity, &t.Unit); err != nil {
			return nil, fmt.Errorf("store.SumByResource: scan: %w", err)
		}
		totals = append(totals, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("store.SumByResource: rows: %w", err)
	}
	return totals, nil
}

// buildWhereClause constructs a parameterized WHERE clause from the filter
// fields that are set (non-empty / non-nil). The returned args slice starts
// at $1; the caller appends any further positional parameters after them.
// The initial args slice should contain any values prepended before the WHERE
// (e.g., none for a bare WHERE; but here we always start with user_id as $1).
func buildWhereClause(filter usage.EventFilter) (string, []any) {
	args := []any{filter.UserID} // $1 is always user_id
	where := " WHERE user_id = $1"

	if filter.From != nil {
		args = append(args, *filter.From)
		where += fmt.Sprintf(" AND occurred_at >= $%d", len(args))
	}
	if filter.To != nil {
		args = append(args, *filter.To)
		where += fmt.Sprintf(" AND occurred_at <= $%d", len(args))
	}
	if filter.ResourceType != "" {
		args = append(args, filter.ResourceType)
		where += fmt.Sprintf(" AND resource_type = $%d", len(args))
	}
	if filter.EventType != "" {
		args = append(args, filter.EventType)
		where += fmt.Sprintf(" AND event_type = $%d", len(args))
	}
	return where, args
}

// ListEvents returns one filtered, paginated page of billing_events rows
// (ORDER BY occurred_at DESC) plus the total count matching the filter.
func (s *PostgresStore) ListEvents(ctx context.Context, filter usage.EventFilter) ([]usage.BillingRow, int, error) {
	// Defensive clamp — callers should already enforce these but guard at the boundary.
	page := filter.Page
	if page < 1 {
		page = 1
	}
	pageSize := filter.PageSize
	if pageSize < 1 {
		pageSize = 25
	}
	if pageSize > 100 {
		pageSize = 100
	}

	where, args := buildWhereClause(filter)

	// Count query — same WHERE, no ORDER/LIMIT.
	countQuery := "SELECT COUNT(*) FROM billing_events" + where
	var totalCount int
	if err := s.pool.QueryRow(ctx, countQuery, args...).Scan(&totalCount); err != nil {
		return nil, 0, fmt.Errorf("store.ListEvents: count: %w", err)
	}

	// Pagination args.
	offset := (page - 1) * pageSize
	args = append(args, pageSize, offset)
	dataQuery := fmt.Sprintf(
		`SELECT user_id::text, event_type, resource_type, quantity, unit, provider,
		        source_entity_type, source_entity_id::text, occurred_at
		 FROM billing_events%s
		 ORDER BY occurred_at DESC, id DESC
		 LIMIT $%d OFFSET $%d`,
		where, len(args)-1, len(args),
	)

	rows, err := s.pool.Query(ctx, dataQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("store.ListEvents: query: %w", err)
	}
	defer rows.Close()

	var result []usage.BillingRow
	for rows.Next() {
		var r usage.BillingRow
		if err := rows.Scan(
			&r.UserID,
			&r.EventType,
			&r.ResourceType,
			&r.Quantity,
			&r.Unit,
			&r.Provider,
			&r.SourceEntityType,
			&r.SourceEntityID,
			&r.OccurredAt,
		); err != nil {
			return nil, 0, fmt.Errorf("store.ListEvents: scan: %w", err)
		}
		result = append(result, r)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("store.ListEvents: rows: %w", err)
	}
	return result, totalCount, nil
}

// SumByResourceFiltered is SumByResource restricted to the report filter.
func (s *PostgresStore) SumByResourceFiltered(ctx context.Context, filter usage.EventFilter) ([]usage.ResourceTotal, error) {
	where, args := buildWhereClause(filter)

	query := `SELECT event_type, resource_type, SUM(quantity)::bigint, unit
	          FROM billing_events` + where + `
	          GROUP BY event_type, resource_type, unit
	          ORDER BY event_type, resource_type`

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("store.SumByResourceFiltered: query: %w", err)
	}
	defer rows.Close()

	var totals []usage.ResourceTotal
	for rows.Next() {
		var t usage.ResourceTotal
		if err := rows.Scan(&t.EventType, &t.ResourceType, &t.TotalQuantity, &t.Unit); err != nil {
			return nil, fmt.Errorf("store.SumByResourceFiltered: scan: %w", err)
		}
		totals = append(totals, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("store.SumByResourceFiltered: rows: %w", err)
	}
	return totals, nil
}
