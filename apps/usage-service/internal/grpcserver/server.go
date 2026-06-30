// Package grpcserver is the gRPC adapter exposing UsageService.GetUsageSummary,
// consumed by api-gateway (session-auth, user_id caller-supplied from the
// validated session). Covered by the authed e2e through the gateway.
package grpcserver

import (
	"context"

	"github.com/photoops/usage-service/internal/usage"
)

// SummaryReader is the port the handler drives: fetch a user's raw totals and
// build the priced summary. GREEN wires this to Store.SumByResource +
// usage.BuildSummary with the instance's configured pricing provider.
type SummaryReader interface {
	SummaryForUser(ctx context.Context, userID string) (usage.Summary, error)
}

// Server adapts SummaryReader to the generated UsageService gRPC interface.
// GREEN: embed pb.UnimplementedUsageServiceServer, map the proto request/response.
type Server struct {
	reader SummaryReader
}

func NewServer(reader SummaryReader) *Server {
	return &Server{reader: reader}
}
