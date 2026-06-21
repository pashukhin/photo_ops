FROM golang:1.23-alpine AS build
WORKDIR /src
COPY apps/cluster-service .
RUN go build -o /bin/cluster-service ./cmd/server

FROM alpine:3.21
COPY --from=build /bin/cluster-service /bin/cluster-service
CMD ["/bin/cluster-service"]
