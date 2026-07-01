// Package grpcserver is the gRPC adapter exposing UsageService.GetUsageSummary,
// consumed by api-gateway (session-auth, user_id caller-supplied from the
// validated session). Covered by the authed e2e through the gateway.
package grpcserver

import (
	"context"
	"time"

	commonpb "github.com/photoops/usage-service/internal/pb/common/v1"
	pb "github.com/photoops/usage-service/internal/pb/usage/v1"
	"github.com/photoops/usage-service/internal/usage"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// UsageReader is the read-path port the handlers drive: the priced summary and
// the itemized event report. *usage.Reader satisfies it.
type UsageReader interface {
	SummaryForUser(ctx context.Context, userID string) (usage.Summary, error)
	EventsForUser(ctx context.Context, filter usage.EventFilter) (usage.EventReport, error)
}

// Server adapts UsageReader to the generated UsageService gRPC interface.
type Server struct {
	pb.UnimplementedUsageServiceServer
	reader UsageReader
}

func NewServer(reader UsageReader) *Server {
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

// parseOptionalTime parses an RFC3339 timestamp string into a *time.Time.
// An empty string returns nil (unbounded). A non-empty but unparseable string
// returns an error.
func parseOptionalTime(s string) (*time.Time, error) {
	if s == "" {
		return nil, nil
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// ListUsageEvents fetches one filtered, paginated page of itemized usage lines.
func (s *Server) ListUsageEvents(ctx context.Context, req *pb.ListUsageEventsRequest) (*pb.ListUsageEventsResponse, error) {
	from, err := parseOptionalTime(req.GetOccurredFrom())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "occurred_from: %v", err)
	}
	to, err := parseOptionalTime(req.GetOccurredTo())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "occurred_to: %v", err)
	}

	page := int(req.GetPage())
	if page < 1 {
		page = 1
	}
	pageSize := int(req.GetPageSize())
	if pageSize < 1 {
		pageSize = 25
	}
	if pageSize > 100 {
		pageSize = 100
	}

	filter := usage.EventFilter{
		UserID:       req.GetUserId(),
		From:         from,
		To:           to,
		ResourceType: req.GetResourceType(),
		EventType:    req.GetEventType(),
		Page:         page,
		PageSize:     pageSize,
	}

	report, err := s.reader.EventsForUser(ctx, filter)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "list usage events: %v", err)
	}

	lines := make([]*pb.UsageEventLine, 0, len(report.Lines))
	for _, l := range report.Lines {
		lines = append(lines, &pb.UsageEventLine{
			OccurredAt:       l.OccurredAt.UTC().Format(time.RFC3339),
			EventType:        l.EventType,
			ResourceType:     l.ResourceType,
			Quantity:         l.Quantity,
			Unit:             l.Unit,
			UnitPrice:        l.UnitPrice,
			Amount:           l.Amount,
			Currency:         l.Currency,
			SourceEntityType: l.SourceEntityType,
			SourceEntityId:   l.SourceEntityID,
		})
	}

	return &pb.ListUsageEventsResponse{
		Lines:               lines,
		TotalCount:          uint32(report.TotalCount), //nolint:gosec // count is always non-negative
		FilteredTotalAmount: report.FilteredTotalAmount,
		Currency:            report.Currency,
	}, nil
}
