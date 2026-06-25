import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { AmqplibInstrumentation } from '@opentelemetry/instrumentation-amqplib';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { GrpcInstrumentation } from '@opentelemetry/instrumentation-grpc';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { Resource } from '@opentelemetry/resources';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

let started = false;

/**
 * Propagation-only OTel: registers a tracer provider (no exporter, no span
 * processor) plus the W3C propagator and HTTP/gRPC/AMQP instrumentation. Spans
 * are created in-memory to carry trace_id/span_id and propagate context; they
 * are never exported. Must run before the instrumented modules are required —
 * import this as the FIRST import of the service `main.ts`.
 *
 * Note: brief used `resourceFromAttributes` from `@opentelemetry/resources` but
 * the installed version (^1.30.0) exports `Resource` (class) instead. Behaviour
 * is identical — a resource carrying the service name is set on the provider.
 */
export function startTracing(serviceName: string): void {
  if (started) return;
  started = true;
  const provider = new NodeTracerProvider({
    resource: new Resource({ [ATTR_SERVICE_NAME]: serviceName })
  });
  // register() installs the global W3C TraceContext propagator + AsyncLocalStorage
  // context manager. No span processor is added → nothing is exported.
  provider.register();
  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new GrpcInstrumentation(),
      new AmqplibInstrumentation()
    ]
  });
}
