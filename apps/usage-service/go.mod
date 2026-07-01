module github.com/photoops/usage-service

go 1.23.0

toolchain go1.23.1

// The provider-independent core (internal/usage) is stdlib-only; the require
// blocks below are pulled in only by the boundary adapters (store/amqp/grpcserver)
// and the generated proto. Pinned go-1.23-compatible — the newest grpc/genproto/
// x/net require go 1.25, so keep the `go 1.23.0` directive when updating deps.

require (
	github.com/google/uuid v1.6.0
	github.com/jackc/pgx/v5 v5.7.2
	github.com/rabbitmq/amqp091-go v1.10.0
	google.golang.org/genproto/googleapis/api v0.0.0-20250324211829-b45e905df463
	google.golang.org/grpc v1.73.0
	google.golang.org/protobuf v1.36.11
)

require (
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	golang.org/x/crypto v0.36.0 // indirect
	golang.org/x/net v0.38.0 // indirect
	golang.org/x/sync v0.12.0 // indirect
	golang.org/x/sys v0.31.0 // indirect
	golang.org/x/text v0.23.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20250324211829-b45e905df463 // indirect
)
