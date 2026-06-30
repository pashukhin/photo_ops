// Command usage-service runs the usage-accounting plane: it consumes
// ConsumptionEvents from RabbitMQ (usage.events) into the append-only ledger and
// serves UsageService.GetUsageSummary over gRPC to api-gateway.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc"

	"github.com/photoops/usage-service/internal/amqp"
	"github.com/photoops/usage-service/internal/grpcserver"
	pb "github.com/photoops/usage-service/internal/pb/usage/v1"
	"github.com/photoops/usage-service/internal/store"
	"github.com/photoops/usage-service/internal/usage"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stderr, nil))

	// --- config from env ---
	dbURL := requireEnv("USAGE_DATABASE_URL")
	rabbitURL := requireEnv("RABBITMQ_URL")
	grpcPort := envOr("USAGE_SERVICE_GRPC_PORT", "50056")
	provider := envOr("USAGE_PROVIDER", "local-demo")

	// --- root context with signal cancellation ---
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	// --- postgres pool ---
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Error("pgxpool.New failed", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	// --- domain wiring ---
	pgStore := store.NewPostgresStore(pool)
	ledger := usage.NewLedger(pgStore)
	reader := usage.NewReader(pgStore, usage.StaticResolver{}, provider)

	// --- AMQP consumer (goroutine) ---
	consumer := amqp.NewConsumer(ledger, rabbitURL)
	go func() {
		if err := consumer.Start(ctx); err != nil {
			log.Error("amqp consumer stopped", "err", err)
		}
	}()

	// --- gRPC server ---
	lis, err := net.Listen("tcp", fmt.Sprintf(":%s", grpcPort))
	if err != nil {
		log.Error("net.Listen failed", "port", grpcPort, "err", err)
		os.Exit(1)
	}

	srv := grpc.NewServer()
	pb.RegisterUsageServiceServer(srv, grpcserver.NewServer(reader))

	// Graceful stop on context cancellation.
	go func() {
		<-ctx.Done()
		log.Info("shutting down gRPC server")
		srv.GracefulStop()
	}()

	log.Info("usage-service gRPC listening", "port", grpcPort, "provider", provider)
	if err := srv.Serve(lis); err != nil {
		log.Error("grpc.Serve failed", "err", err)
		os.Exit(1)
	}
}

func requireEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		slog.Error("required env var not set", "key", key)
		os.Exit(1)
	}
	return v
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
