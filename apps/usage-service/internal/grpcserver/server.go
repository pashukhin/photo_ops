// Package grpcserver is the gRPC adapter exposing UsageService.GetUsageSummary,
// consumed by api-gateway (session-auth, user_id caller-supplied from the
// validated session). Covered by the authed e2e through the gateway.
package grpcserver

import (
	"context"

	commonpb "github.com/photoops/usage-service/internal/pb/common/v1"
	pb "github.com/photoops/usage-service/internal/pb/usage/v1"
	"github.com/photoops/usage-service/internal/usage"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// SummaryReader is the port the handler drives: fetch a user's raw totals and
// build the priced summary. GREEN wires this to Store.SumByResource +
// usage.BuildSummary with the instance's configured pricing provider.
type SummaryReader interface {
	SummaryForUser(ctx context.Context, userID string) (usage.Summary, error)
}

// Server adapts SummaryReader to the generated UsageService gRPC interface.
type Server struct {
	pb.UnimplementedUsageServiceServer
	reader SummaryReader
}

func NewServer(reader SummaryReader) *Server {
	return &Server{reader: reader}
}

// GetUsageSummary fetches the priced usage summary for the requested user and
// maps it to the proto response.
func (s *Server) GetUsageSummary(ctx context.Context, req *pb.GetUsageSummaryRequest) (*pb.GetUsageSummaryResponse, error) {
	summary, err := s.reader.SummaryForUser(ctx, req.GetUserId())
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get usage summary: %v", err)
	}

	lines := make([]*pb.UsageLine, 0, len(summary.Lines))
	for _, l := range summary.Lines {
		lines = append(lines, &pb.UsageLine{
			EventType:     l.EventType,
			ResourceType:  l.ResourceType,
			TotalQuantity: l.TotalQuantity,
			Unit:          l.Unit,
		})
	}

	return &pb.GetUsageSummaryResponse{
		Lines:                lines,
		EstimatedMonthlyCost: summary.EstimatedMonthlyCost,
		Currency:             summary.Currency,
	}, nil
}

// Health returns service liveness — no dependency probing at this layer.
func (s *Server) Health(_ context.Context, _ *commonpb.HealthCheckRequest) (*commonpb.HealthCheckResponse, error) {
	return &commonpb.HealthCheckResponse{
		Status:  "ok",
		Service: "usage-service",
	}, nil
}
