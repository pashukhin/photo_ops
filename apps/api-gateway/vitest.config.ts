import { coverageConfigDefaults, defineConfig } from 'vitest/config';

// api-gateway tests run in the default (node) environment. Coverage excludes the
// thin wiring/IO glue that is exercised end-to-end by the live smokes rather than
// unit tests: the NestJS bootstrap/DI wiring and the gRPC client adapters
// (proto-loader + promisified stubs). Controller logic + auth are unit-tested.
export default defineConfig({
  test: {
    coverage: {
      exclude: [
        ...coverageConfigDefaults.exclude,
        'src/main.ts',
        'src/tracing.ts',
        'src/app.module.ts',
        'src/grpc/**'
      ]
    }
  }
});
