# usage-service: Go usage-accounting plane. Multi-stage build; static binary on
# a distroless runtime. Build context is the repo root (see compose).
# GREEN: split COPY go.mod/go.sum first for layer caching once external deps land.
FROM golang:1.23-alpine AS build
WORKDIR /src
COPY apps/usage-service/ ./
RUN CGO_ENABLED=0 go build -o /out/usage-service ./cmd/usage-service

FROM gcr.io/distroless/static-debian12
COPY --from=build /out/usage-service /usage-service
ENTRYPOINT ["/usage-service"]
