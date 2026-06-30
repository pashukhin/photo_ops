// Command usage-service runs the usage-accounting plane: it consumes
// ConsumptionEvents from RabbitMQ (usage.events) into the append-only ledger and
// serves UsageService.GetUsageSummary over gRPC to api-gateway.
package main

func main() {
	// GREEN wiring (see plan):
	//   cfg    := config.Load()
	//   pool   := pgxpool.New(ctx, cfg.DatabaseURL)
	//   store  := store.NewPostgresStore(pool)
	//   ledger := usage.NewLedger(store)                                   // amqp.Recorder
	//   reader := usage.NewReader(store, usage.StaticResolver{}, cfg.Provider) // grpcserver.SummaryReader
	//   go amqp.NewConsumer(ledger).Start(ctx)
	//   grpcserver serves UsageService backed by reader
	panic("not implemented") // GREEN is the implementer's job
}
