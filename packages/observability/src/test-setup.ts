import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterAll } from 'vitest';

// Register a real context manager so context.with() propagates spans in tests.
// This is test-only; production code does its own SDK bootstrap.
const provider = new NodeTracerProvider();
provider.register();
afterAll(() => provider.shutdown());
