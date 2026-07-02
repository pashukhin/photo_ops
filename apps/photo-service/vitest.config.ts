import { coverageConfigDefaults, defineConfig } from 'vitest/config';

// photo-service tests run in the default (node) environment. Coverage excludes
// the IO/bootstrap layer that is exercised by the live smokes rather than unit
// tests: the DB adapter (repository + drizzle client), MinIO/RabbitMQ adapters,
// and the process bootstrap. Domain/service/controller logic is unit-tested.
export default defineConfig({
  test: {
    coverage: {
      exclude: [
        ...coverageConfigDefaults.exclude,
        'src/main.ts',
        'src/tracing.ts',
        'src/photo/test-otel.ts',
        'src/photo/photo.repository.ts',
        'src/db/**',
        'src/storage/**',
        'src/messaging/rabbitmq-bus.ts'
      ]
    }
  }
});
