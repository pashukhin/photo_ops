module github.com/photoops/usage-service

go 1.23

// External adapters (pgx, amqp091-go, grpc) and their require block are added
// during GREEN, when the boundary packages are wired. The session-012 skeleton's
// tested core (internal/usage) is stdlib-only so its RED tests run without a
// network fetch.
