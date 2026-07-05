import { coverageConfigDefaults, defineConfig } from 'vitest/config';

// publication-service tests run in the default (node) environment. Coverage
// excludes the IO/bootstrap layer exercised by the live smoke rather than unit
// tests: the DB adapter (repository + drizzle client), the cluster-service read
// adapter (proto-loader gRPC client), and the process bootstrap. Domain/service/
// controller logic is unit-tested.
export default defineConfig({
  test: {
    coverage: {
      exclude: [
        ...coverageConfigDefaults.exclude,
        'src/main.ts',
        'src/tracing.ts',
        'src/app.module.ts',
        'src/db/**',
        'src/post/post.repository.ts',
        'src/post/cluster.reader.ts'
      ]
    }
  }
});
