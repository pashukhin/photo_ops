# Structured Logging Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every service structured JSON logging with an OpenTelemetry
trace-context correlation id propagated across HTTP → gRPC → RabbitMQ, consistent
levels, and no secrets in logs — no exporter/backend (that is `pb6`).

**Architecture:** A shared buildable workspace package `@photoops/observability`
holds the OTel propagation-only bootstrap, the pino logger config (with the
single redaction list and a `trace_id`/`span_id` mixin), the traceparent
bridge helpers, and a gRPC logging interceptor. The three NestJS services wire
`nestjs-pino` + `startTracing` at their edge; the photo-service bridges the
async hop by stamping the W3C `traceparent` into the existing proto
`correlation_id` field on publish and re-binding it on result consume; the
Python `media-worker` gets a dependency-free JSON formatter that binds
`trace_id`/`correlation_id` from the job.

**Tech Stack:** TypeScript / NestJS 10, `pino` 9, `nestjs-pino` 4,
`@opentelemetry/*` (api + sdk-trace-node + instrumentation-{http,express,grpc,amqplib}),
Python 3.12 stdlib `logging`, pnpm workspaces, Docker Compose.

## Global Constraints

- Do NOT add any OTel exporter, span processor, trace/metrics backend, or RED
  metrics — propagation only. Spans are created in-memory and never exported.
- One redaction list, defined once in `@photoops/observability` (`REDACT_PATHS`);
  never copy redaction paths into a service.
- `trace_id` is the cross-service correlation key; carry the **full** W3C
  traceparent (`00-<traceId>-<spanId>-<flags>`) on the AMQP hop, not a bare id.
- The proto `correlation_id` field is the async-hop carrier; `job_id`
  (== `ProcessingJob.id`) remains the idempotency key — do not conflate them.
- Default `LOG_LEVEL=info`, read from `process.env.LOG_LEVEL` (TS) / `LOG_LEVEL`
  env (Python) per service.
- Project rule: regular git branch (already on `session/010-structured-logging-baseline`),
  no worktrees. Every commit ends with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.
- OTel package APIs churn between 1.x and 2.x (notably the `Resource` factory and
  `semantic-conventions` export names). Pin all `@opentelemetry/*` packages to a
  single mutually-compatible release line at install time; if an import path in
  this plan does not resolve, make the smallest working adjustment (per AGENTS)
  and keep the behavior identical.

---

## Task 1: Shared package scaffold + logger options (redaction + trace mixin)

Creates `@photoops/observability` and its pino logger config: the redaction
list and the `trace_id`/`span_id` mixin. This is the security-sensitive core, so
it is tested first and in isolation.

**Files:**
- Create: `packages/observability/package.json`
- Create: `packages/observability/tsconfig.json`
- Create: `packages/observability/tsconfig.build.json`
- Create: `packages/observability/src/logger.ts`
- Create: `packages/observability/src/index.ts`
- Test: `packages/observability/src/logger.spec.ts`
- Modify: `package.json` (root — make `test` include workspace packages)

**Interfaces:**
- Produces:
  - `REDACT_PATHS: string[]`
  - `traceMixin(): { trace_id: string; span_id: string }`
  - `makeLoggerOptions(serviceName: string): import('pino').LoggerOptions`
  - `index.ts` re-exports all public symbols.

- [ ] **Step 1: Create the package manifest**

`packages/observability/package.json`:

```json
{
  "name": "@photoops/observability",
  "private": true,
  "version": "0.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@opentelemetry/api": "^1.9.0",
    "@opentelemetry/core": "^1.30.0",
    "@opentelemetry/instrumentation": "^0.57.0",
    "@opentelemetry/instrumentation-amqplib": "^0.46.0",
    "@opentelemetry/instrumentation-express": "^0.47.0",
    "@opentelemetry/instrumentation-grpc": "^0.57.0",
    "@opentelemetry/instrumentation-http": "^0.57.0",
    "@opentelemetry/resources": "^1.30.0",
    "@opentelemetry/sdk-trace-node": "^1.30.0",
    "@opentelemetry/semantic-conventions": "^1.28.0",
    "pino": "^9.6.0"
  },
  "peerDependencies": {
    "@nestjs/common": "^10.4.15",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/common": "^10.4.15",
    "rxjs": "^7.8.1",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create the tsconfigs**

`packages/observability/tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true
  },
  "include": ["src/**/*.ts"]
}
```

`packages/observability/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["src/**/*.spec.ts", "dist"]
}
```

- [ ] **Step 3: Write the failing test**

`packages/observability/src/logger.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { context, trace } from '@opentelemetry/api';
import pino from 'pino';
import { makeLoggerOptions, REDACT_PATHS, traceMixin } from './logger';

function captureLine(fn: (logger: pino.Logger) => void): Record<string, unknown> {
  const lines: string[] = [];
  const stream = { write: (s: string) => lines.push(s) };
  const logger = pino(makeLoggerOptions('test-service'), stream);
  fn(logger);
  return JSON.parse(lines[lines.length - 1]);
}

describe('makeLoggerOptions', () => {
  it('stamps the service name', () => {
    const line = captureLine((l) => l.info('hello'));
    expect(line.service).toBe('test-service');
  });

  it('redacts secrets', () => {
    const line = captureLine((l) =>
      l.info(
        {
          password: 'hunter2',
          passwordHash: '$argon2id$abc',
          uploadUrl: 'https://minio/put?X-Amz-Signature=secret',
          nested: { password: 'inner' }
        },
        'sensitive'
      )
    );
    expect(line.password).toBe('[REDACTED]');
    expect(line.passwordHash).toBe('[REDACTED]');
    expect(line.uploadUrl).toBe('[REDACTED]');
    expect((line.nested as Record<string, unknown>).password).toBe('[REDACTED]');
  });
});

describe('traceMixin', () => {
  it('returns empty ids with no active span', () => {
    expect(traceMixin()).toEqual({ trace_id: '', span_id: '' });
  });

  it('returns the active span ids', () => {
    const sc = { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 };
    const span = trace.wrapSpanContext(sc);
    context.with(trace.setSpan(context.active(), span), () => {
      expect(traceMixin()).toEqual({ trace_id: 'a'.repeat(32), span_id: 'b'.repeat(16) });
    });
  });
});

describe('REDACT_PATHS', () => {
  it('covers cookies and authorization headers', () => {
    expect(REDACT_PATHS).toContain('req.headers.cookie');
    expect(REDACT_PATHS).toContain('req.headers.authorization');
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

Run: `pnpm --filter @photoops/observability test`
Expected: FAIL — `logger.ts` does not exist.

- [ ] **Step 5: Implement `logger.ts`**

`packages/observability/src/logger.ts`:

```ts
import { isSpanContextValid, trace } from '@opentelemetry/api';
import type { LoggerOptions } from 'pino';

/**
 * Single source of truth for secret redaction. pino redacts these paths on
 * every log object (including the auto-logged HTTP req/res). Never duplicate
 * this list into a service — import it.
 */
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
  'uploadUrl',
  '*.uploadUrl',
  'presignedUrl',
  '*.presignedUrl'
];

/** Injects the active OTel trace/span ids into every log line. */
export function traceMixin(): { trace_id: string; span_id: string } {
  const span = trace.getActiveSpan();
  if (!span) return { trace_id: '', span_id: '' };
  const sc = span.spanContext();
  if (!isSpanContextValid(sc)) return { trace_id: '', span_id: '' };
  return { trace_id: sc.traceId, span_id: sc.spanId };
}

/** pino options shared by every TS service (and the gRPC interceptor). */
export function makeLoggerOptions(serviceName: string): LoggerOptions {
  return {
    level: process.env.LOG_LEVEL ?? 'info',
    base: { service: serviceName },
    mixin: traceMixin,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' }
  };
}
```

- [ ] **Step 6: Create the barrel export**

`packages/observability/src/index.ts`:

```ts
export { makeLoggerOptions, REDACT_PATHS, traceMixin } from './logger';
```

- [ ] **Step 7: Make root `test` cover workspace packages**

In root `package.json`, change the `test` script so the new package's vitest
suite runs in `make test` / `make gate` (today it filters `./apps/*` only):

```json
    "test": "sh scripts/test-smoke-upload-contract.sh && pnpm --filter './apps/*' --filter './packages/*' --if-present test",
```

- [ ] **Step 8: Install and run the test**

Run: `pnpm install && pnpm --filter @photoops/observability test`
Expected: PASS (all three describe blocks green).

- [ ] **Step 9: Verify the package builds and typechecks**

Run: `pnpm --filter @photoops/observability build && pnpm --filter @photoops/observability typecheck`
Expected: `dist/index.js` + `dist/index.d.ts` emitted; no type errors.

- [ ] **Step 10: Commit**

```bash
git add packages/observability package.json pnpm-lock.yaml
git commit -m "feat(obs): add @photoops/observability with redacting pino options + trace mixin"
```

---

## Task 2: Tracing bootstrap + traceparent bridge helpers

Adds the propagation-only OTel `startTracing` and the helpers the photo-service
bridge uses: build a traceparent from the active span, and run a callback inside
a context extracted from an inbound traceparent.

**Files:**
- Create: `packages/observability/src/tracing.ts`
- Create: `packages/observability/src/context.ts`
- Modify: `packages/observability/src/index.ts`
- Test: `packages/observability/src/context.spec.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `startTracing(serviceName: string): void`
  - `currentTraceparent(): string | undefined`
  - `withExtractedContext<T>(traceparent: string | undefined, fn: () => T): T`

- [ ] **Step 1: Write the failing test**

`packages/observability/src/context.spec.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { context, propagation, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { currentTraceparent, withExtractedContext } from './context';

beforeAll(() => {
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
});

describe('currentTraceparent', () => {
  it('is undefined with no active span', () => {
    expect(currentTraceparent()).toBeUndefined();
  });

  it('serializes the active span as a W3C traceparent', () => {
    const sc = { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 };
    const span = trace.wrapSpanContext(sc);
    context.with(trace.setSpan(context.active(), span), () => {
      expect(currentTraceparent()).toBe(`00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`);
    });
  });
});

describe('withExtractedContext', () => {
  it('runs fn with the extracted trace id active', () => {
    const tp = `00-${'c'.repeat(32)}-${'d'.repeat(16)}-01`;
    const seen = withExtractedContext(tp, () => trace.getActiveSpan()?.spanContext().traceId);
    expect(seen).toBe('c'.repeat(32));
  });

  it('runs fn unchanged when traceparent is missing', () => {
    expect(withExtractedContext(undefined, () => 42)).toBe(42);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @photoops/observability test src/context.spec.ts`
Expected: FAIL — `context.ts` does not exist.

- [ ] **Step 3: Implement `context.ts`**

`packages/observability/src/context.ts`:

```ts
import { context, isSpanContextValid, propagation, trace } from '@opentelemetry/api';

/** Build a W3C traceparent string from the active span, or undefined if none. */
export function currentTraceparent(): string | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;
  const sc = span.spanContext();
  if (!isSpanContextValid(sc)) return undefined;
  const flags = sc.traceFlags.toString(16).padStart(2, '0');
  return `00-${sc.traceId}-${sc.spanId}-${flags}`;
}

/**
 * Run `fn` inside the OTel context carried by an inbound traceparent so that
 * logs emitted within it carry the originating trace id. No-op passthrough when
 * the traceparent is absent.
 */
export function withExtractedContext<T>(traceparent: string | undefined, fn: () => T): T {
  if (!traceparent) return fn();
  const ctx = propagation.extract(context.active(), { traceparent });
  return context.with(ctx, fn);
}
```

- [ ] **Step 4: Implement `tracing.ts`**

`packages/observability/src/tracing.ts`:

```ts
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { AmqplibInstrumentation } from '@opentelemetry/instrumentation-amqplib';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { GrpcInstrumentation } from '@opentelemetry/instrumentation-grpc';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

let started = false;

/**
 * Propagation-only OTel: registers a tracer provider (no exporter, no span
 * processor) plus the W3C propagator and HTTP/gRPC/AMQP instrumentation. Spans
 * are created in-memory to carry trace_id/span_id and propagate context; they
 * are never exported. Must run before the instrumented modules are required —
 * import this as the FIRST import of the service `main.ts`.
 */
export function startTracing(serviceName: string): void {
  if (started) return;
  started = true;
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName })
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
```

> Note (OTel API churn): if the pinned line is 1.x, `resourceFromAttributes`
> may instead be `new Resource({ [SEMRESATTRS_SERVICE_NAME]: serviceName })`
> from `@opentelemetry/resources` + `@opentelemetry/semantic-conventions`. Use
> whichever the installed versions export; behavior is identical.

- [ ] **Step 5: Update the barrel export**

`packages/observability/src/index.ts`:

```ts
export { makeLoggerOptions, REDACT_PATHS, traceMixin } from './logger';
export { startTracing } from './tracing';
export { currentTraceparent, withExtractedContext } from './context';
```

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @photoops/observability test`
Expected: PASS (logger + context suites).

- [ ] **Step 7: Build + typecheck**

Run: `pnpm --filter @photoops/observability build && pnpm --filter @photoops/observability typecheck`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add packages/observability
git commit -m "feat(obs): add propagation-only startTracing + traceparent bridge helpers"
```

---

## Task 3: gRPC logging interceptor (in the shared package)

A NestJS interceptor that logs one line per gRPC RPC (method, outcome,
duration). identity-service and photo-service both register it, so it lives in
the shared package.

**Files:**
- Create: `packages/observability/src/grpc-logging.interceptor.ts`
- Modify: `packages/observability/src/index.ts`
- Test: `packages/observability/src/grpc-logging.interceptor.spec.ts`

**Interfaces:**
- Consumes: `makeLoggerOptions` (Task 1).
- Produces: `class GrpcLoggingInterceptor implements NestInterceptor` with
  constructor `(serviceName: string, logger?: pino.Logger)`.

- [ ] **Step 1: Write the failing test**

`packages/observability/src/grpc-logging.interceptor.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { GrpcLoggingInterceptor } from './grpc-logging.interceptor';

function rpcContext(handlerName: string): ExecutionContext {
  return {
    getType: () => 'rpc',
    getHandler: () => ({ name: handlerName }),
    switchToRpc: () => ({ getData: () => ({}), getContext: () => ({}) })
  } as unknown as ExecutionContext;
}

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn() } as unknown as import('pino').Logger;
}

describe('GrpcLoggingInterceptor', () => {
  it('logs info on success', async () => {
    const logger = fakeLogger();
    const interceptor = new GrpcLoggingInterceptor('photo-service', logger);
    const next: CallHandler = { handle: () => of({ ok: true }) };
    await new Promise<void>((resolve) =>
      interceptor.intercept(rpcContext('ListPhotos'), next).subscribe({ complete: resolve })
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ rpc: 'ListPhotos', outcome: 'ok' }),
      'grpc.request'
    );
  });

  it('logs warn on error', async () => {
    const logger = fakeLogger();
    const interceptor = new GrpcLoggingInterceptor('photo-service', logger);
    const next: CallHandler = { handle: () => throwError(() => ({ code: 5 })) };
    await new Promise<void>((resolve) =>
      interceptor.intercept(rpcContext('GetPhoto'), next).subscribe({ error: () => resolve() })
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ rpc: 'GetPhoto', outcome: 'error', err_code: 5 }),
      'grpc.request'
    );
  });

  it('passes non-rpc contexts through without logging', async () => {
    const logger = fakeLogger();
    const interceptor = new GrpcLoggingInterceptor('photo-service', logger);
    const httpCtx = { getType: () => 'http' } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of('x') };
    await new Promise<void>((resolve) =>
      interceptor.intercept(httpCtx, next).subscribe({ complete: resolve })
    );
    expect(logger.info).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @photoops/observability test src/grpc-logging.interceptor.spec.ts`
Expected: FAIL — interceptor does not exist.

- [ ] **Step 3: Implement the interceptor**

`packages/observability/src/grpc-logging.interceptor.ts`:

```ts
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import pino from 'pino';
import { makeLoggerOptions } from './logger';

/**
 * Logs one line per gRPC RPC with method, outcome, and duration. Uses a pino
 * logger sharing the standard options (so the trace_id mixin applies). HTTP
 * contexts pass through untouched — nestjs-pino already logs those.
 */
@Injectable()
export class GrpcLoggingInterceptor implements NestInterceptor {
  private readonly logger: pino.Logger;

  constructor(serviceName: string, logger?: pino.Logger) {
    this.logger = logger ?? pino(makeLoggerOptions(serviceName));
  }

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'rpc') return next.handle();
    const rpc = ctx.getHandler().name;
    const start = Date.now();
    return next.handle().pipe(
      tap({
        next: () =>
          this.logger.info({ rpc, outcome: 'ok', duration_ms: Date.now() - start }, 'grpc.request'),
        error: (err: { code?: number }) =>
          this.logger.warn(
            { rpc, outcome: 'error', duration_ms: Date.now() - start, err_code: err?.code },
            'grpc.request'
          )
      })
    );
  }
}
```

- [ ] **Step 4: Update the barrel export**

Add to `packages/observability/src/index.ts`:

```ts
export { GrpcLoggingInterceptor } from './grpc-logging.interceptor';
```

- [ ] **Step 5: Run the full package suite + build**

Run: `pnpm --filter @photoops/observability test && pnpm --filter @photoops/observability build`
Expected: PASS; `dist` updated.

- [ ] **Step 6: Commit**

```bash
git add packages/observability
git commit -m "feat(obs): add GrpcLoggingInterceptor for per-RPC structured logs"
```

---

## Task 4: Wire api-gateway to nestjs-pino + OTel

Replaces the gateway's default Nest logger with structured JSON, auto-logs HTTP
requests, and starts propagation-only tracing before Nest boots.

**Files:**
- Modify: `apps/api-gateway/package.json` (deps)
- Create: `apps/api-gateway/src/tracing.ts`
- Modify: `apps/api-gateway/src/main.ts`
- Modify: `apps/api-gateway/src/app.module.ts`
- Modify: `apps/api-gateway/Dockerfile`

**Interfaces:**
- Consumes: `startTracing`, `makeLoggerOptions` from `@photoops/observability`.
- Produces: gateway emits one JSON line per HTTP request with `service`,
  `trace_id`, `req`/`res` fields.

- [ ] **Step 1: Add dependencies**

In `apps/api-gateway/package.json` `dependencies`, add:

```json
    "@photoops/observability": "workspace:*",
    "nestjs-pino": "^4.1.0",
    "pino": "^9.6.0",
    "pino-http": "^10.3.0",
```

- [ ] **Step 2: Create the tracing entry**

`apps/api-gateway/src/tracing.ts`:

```ts
import { startTracing } from '@photoops/observability';

startTracing('api-gateway');
```

- [ ] **Step 3: Import tracing first + use the pino logger in `main.ts`**

`apps/api-gateway/src/main.ts` — make `./tracing` the FIRST import and route Nest
logs through pino:

```ts
import './tracing';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { createCorsOptions } from './cors';
import { HttpErrorFilter } from './errors/http-error.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableCors(createCorsOptions());
  app.useGlobalFilters(new HttpErrorFilter());
  await app.listen(process.env.API_GATEWAY_PORT ?? 3001);
}

void bootstrap();
```

- [ ] **Step 4: Register `LoggerModule` in `app.module.ts`**

`apps/api-gateway/src/app.module.ts` — add the import and module entry:

```ts
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { makeLoggerOptions } from '@photoops/observability';
import { AuthService } from './auth/auth.service';
import { IdentityClient } from './grpc/identity.client';
import { PhotoClient } from './grpc/photo.client';
import { AuthController } from './http/auth.controller';
import { HealthController } from './http/health.controller';
import { PhotoController } from './http/photo.controller';

@Module({
  imports: [LoggerModule.forRoot({ pinoHttp: makeLoggerOptions('api-gateway') })],
  controllers: [HealthController, AuthController, PhotoController],
  providers: [IdentityClient, AuthService, PhotoClient]
})
export class AppModule {}
```

- [ ] **Step 5: Update the Dockerfile to build the workspace dependency**

`apps/api-gateway/Dockerfile` — copy the package manifest before install and
build the dependency closure (`...` suffix builds `@photoops/observability` first):

```dockerfile
FROM node:22-alpine
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api-gateway/package.json apps/api-gateway/package.json
COPY packages/proto-ts/package.json packages/proto-ts/package.json
COPY packages/observability/package.json packages/observability/package.json
RUN corepack enable && pnpm install --filter @photoops/api-gateway --prod=false --frozen-lockfile
COPY . .
RUN pnpm --filter "@photoops/api-gateway..." build
CMD ["pnpm", "--filter", "@photoops/api-gateway", "start"]
```

- [ ] **Step 6: Install, typecheck, run existing gateway tests**

Run: `pnpm install && pnpm --filter @photoops/api-gateway typecheck && pnpm --filter @photoops/api-gateway test`
Expected: typecheck clean; existing gateway tests still PASS.

- [ ] **Step 7: Boot-smoke the gateway emits JSON with trace_id**

Run:
```bash
cd apps/api-gateway && API_GATEWAY_PORT=3001 timeout 6 pnpm start &
sleep 4 && curl -s localhost:3001/health >/dev/null
```
Expected: stdout shows JSON lines including `"service":"api-gateway"` and a
non-empty `"trace_id"` for the `/health` request. Stop the process.

- [ ] **Step 8: Commit**

```bash
git add apps/api-gateway pnpm-lock.yaml
git commit -m "feat(api-gateway): structured pino logging + OTel propagation"
```

---

## Task 5: api-gateway HttpErrorFilter logs with level mapping

The filter currently maps errors to JSON responses silently. Make it log via an
injected pino logger: 4xx → `warn`, 5xx → `error`, each carrying the active
`trace_id` (via the mixin).

**Files:**
- Modify: `apps/api-gateway/src/errors/http-error.filter.ts`
- Modify: `apps/api-gateway/src/main.ts`
- Test: `apps/api-gateway/src/errors/http-error.filter.spec.ts`

**Interfaces:**
- Consumes: `makeLoggerOptions` from `@photoops/observability`.
- Produces: `new HttpErrorFilter(logger?)` — optional `pino.Logger` for tests.

- [ ] **Step 1: Write the failing test**

`apps/api-gateway/src/errors/http-error.filter.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { HttpErrorFilter } from './http-error.filter';

function host(): ArgumentsHost {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  return { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
}

function fakeLogger() {
  return { warn: vi.fn(), error: vi.fn() } as unknown as import('pino').Logger;
}

describe('HttpErrorFilter logging', () => {
  it('logs 4xx as warn', () => {
    const logger = fakeLogger();
    new HttpErrorFilter(logger).catch(
      new HttpException('nope', HttpStatus.UNAUTHORIZED),
      host()
    );
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs unexpected errors as error', () => {
    const logger = fakeLogger();
    new HttpErrorFilter(logger).catch(new Error('boom'), host());
    expect(logger.error).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @photoops/api-gateway test src/errors/http-error.filter.spec.ts`
Expected: FAIL — `HttpErrorFilter` takes no constructor arg / does not log.

- [ ] **Step 3: Add logging to the filter**

`apps/api-gateway/src/errors/http-error.filter.ts` — add the constructor + a
`log` helper and call it on each branch. Full file:

```ts
import { status as GrpcStatus } from '@grpc/grpc-js';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import pino from 'pino';
import { makeLoggerOptions } from '@photoops/observability';

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger: pino.Logger;

  constructor(logger?: pino.Logger) {
    this.logger = logger ?? pino(makeLoggerOptions('api-gateway'));
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = status === HttpStatus.UNAUTHORIZED ? 'unauthorized' : 'http_error';
      this.log(status, code, exception.message);
      response.status(status).json({ code, message: exception.message });
      return;
    }
    if (this.isGrpcError(exception)) {
      const mapped = this.mapGrpcError(exception);
      if (mapped) {
        this.log(mapped.status, mapped.code, exception.details || mapped.message);
        response.status(mapped.status).json({ code: mapped.code, message: exception.details || mapped.message });
        return;
      }
    }
    const message = exception instanceof Error ? exception.message : 'internal error';
    this.log(HttpStatus.INTERNAL_SERVER_ERROR, 'internal_error', message);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ code: 'internal_error', message });
  }

  private log(status: number, code: string, message: string) {
    const fields = { status, code, msg: 'http.error', err_message: message };
    if (status >= 500) this.logger.error(fields, 'http.error');
    else this.logger.warn(fields, 'http.error');
  }

  private isGrpcError(exception: unknown): exception is { code: number; details?: string } {
    return typeof exception === 'object' && exception !== null && 'code' in exception && typeof (exception as { code?: unknown }).code === 'number';
  }

  private mapGrpcError(exception: { code: number }) {
    switch (exception.code) {
      case GrpcStatus.ALREADY_EXISTS:
        return { status: HttpStatus.CONFLICT, code: 'conflict', message: 'already exists' };
      case GrpcStatus.UNAUTHENTICATED:
        return { status: HttpStatus.UNAUTHORIZED, code: 'unauthorized', message: 'authentication required' };
      case GrpcStatus.NOT_FOUND:
        return { status: HttpStatus.NOT_FOUND, code: 'not_found', message: 'not found' };
      case GrpcStatus.INVALID_ARGUMENT:
        return { status: HttpStatus.BAD_REQUEST, code: 'bad_request', message: 'bad request' };
      default:
        return undefined;
    }
  }
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @photoops/api-gateway test src/errors/http-error.filter.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run the full gateway suite + typecheck**

Run: `pnpm --filter @photoops/api-gateway test && pnpm --filter @photoops/api-gateway typecheck`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api-gateway/src/errors apps/api-gateway/src/main.ts
git commit -m "feat(api-gateway): log mapped HTTP errors at warn/error with trace_id"
```

---

## Task 6: Wire identity-service to nestjs-pino + OTel + gRPC interceptor

Same edge wiring as the gateway, plus the gRPC logging interceptor (identity is
a gRPC server).

**Files:**
- Modify: `apps/identity-service/package.json` (deps)
- Create: `apps/identity-service/src/tracing.ts`
- Modify: `apps/identity-service/src/main.ts`
- Modify: `apps/identity-service/src/app.module.ts`
- Modify: `apps/identity-service/Dockerfile`

**Interfaces:**
- Consumes: `startTracing`, `makeLoggerOptions`, `GrpcLoggingInterceptor`.

- [ ] **Step 1: Add dependencies**

In `apps/identity-service/package.json` `dependencies`, add the same four entries
as Task 4 Step 1 (`@photoops/observability`, `nestjs-pino`, `pino`, `pino-http`).

- [ ] **Step 2: Create the tracing entry**

`apps/identity-service/src/tracing.ts`:

```ts
import { startTracing } from '@photoops/observability';

startTracing('identity-service');
```

- [ ] **Step 3: Wire `main.ts` (tracing first, pino logger, gRPC interceptor)**

`apps/identity-service/src/main.ts`:

```ts
import './tracing';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { GrpcLoggingInterceptor } from '@photoops/observability';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new GrpcLoggingInterceptor('identity-service'));
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'photoops.identity.v1',
      protoPath: join(process.cwd(), '../../proto/identity/v1/identity_service.proto'),
      loader: { includeDirs: [join(process.cwd(), '../../proto')] },
      url: `0.0.0.0:${process.env.IDENTITY_SERVICE_GRPC_PORT ?? '50055'}`
    }
  });
  await app.startAllMicroservices();
  await app.listen(process.env.IDENTITY_SERVICE_HTTP_PORT ?? 3005);
}

void bootstrap();
```

- [ ] **Step 4: Register `LoggerModule` in `app.module.ts`**

Add to the identity `AppModule` `@Module({ imports: [...] })` (create the
`imports` array if absent):

```ts
import { LoggerModule } from 'nestjs-pino';
import { makeLoggerOptions } from '@photoops/observability';
// ...
  imports: [LoggerModule.forRoot({ pinoHttp: makeLoggerOptions('identity-service') })],
```

- [ ] **Step 5: Update the Dockerfile**

`apps/identity-service/Dockerfile` — add after the proto-ts copy line:

```dockerfile
COPY packages/observability/package.json packages/observability/package.json
```

and change the build line to:

```dockerfile
RUN pnpm --filter "@photoops/identity-service..." build
```

- [ ] **Step 6: Install, typecheck, test**

Run: `pnpm install && pnpm --filter @photoops/identity-service typecheck && pnpm --filter @photoops/identity-service test`
Expected: clean; existing tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/identity-service pnpm-lock.yaml
git commit -m "feat(identity-service): structured pino logging + OTel + gRPC interceptor"
```

---

## Task 7: Wire photo-service to nestjs-pino + OTel + gRPC interceptor

Edge wiring only (the bridge is Task 8). photo-service is a gRPC server, HTTP
health server, and RabbitMQ producer/consumer.

**Files:**
- Modify: `apps/photo-service/package.json` (deps)
- Create: `apps/photo-service/src/tracing.ts`
- Modify: `apps/photo-service/src/main.ts`
- Modify: `apps/photo-service/src/app.module.ts`
- Modify: `apps/photo-service/Dockerfile`

**Interfaces:**
- Consumes: `startTracing`, `makeLoggerOptions`, `GrpcLoggingInterceptor`.

- [ ] **Step 1: Add dependencies**

Add the same four entries as Task 4 Step 1 to `apps/photo-service/package.json`.

- [ ] **Step 2: Create the tracing entry**

`apps/photo-service/src/tracing.ts`:

```ts
import { startTracing } from '@photoops/observability';

startTracing('photo-service');
```

- [ ] **Step 3: Wire `main.ts`**

`apps/photo-service/src/main.ts` — add `import './tracing';` as the first line,
the pino logger, and the gRPC interceptor (preserve the existing
`ProcessingResultConsumer` startup):

```ts
import './tracing';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { GrpcLoggingInterceptor } from '@photoops/observability';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { ProcessingResultConsumer } from './photo/processing.consumer';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new GrpcLoggingInterceptor('photo-service'));
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'photoops.photo.v1',
      protoPath: join(process.cwd(), '../../proto/photo/v1/photo_service.proto'),
      url: `0.0.0.0:${process.env.PHOTO_SERVICE_GRPC_PORT ?? '50051'}`,
      loader: {
        includeDirs: [join(process.cwd(), '../../proto')]
      }
    }
  });
  await app.startAllMicroservices();
  await app.listen(3002);

  const resultConsumer = app.get(ProcessingResultConsumer);
  await resultConsumer.start();
}

void bootstrap();
```

- [ ] **Step 4: Register `LoggerModule` in `app.module.ts`**

Add to the photo `AppModule` `@Module`:

```ts
import { LoggerModule } from 'nestjs-pino';
import { makeLoggerOptions } from '@photoops/observability';
// ...
  imports: [LoggerModule.forRoot({ pinoHttp: makeLoggerOptions('photo-service') })],
```

- [ ] **Step 5: Update the Dockerfile**

`apps/photo-service/Dockerfile` — add after the proto-ts copy line:

```dockerfile
COPY packages/observability/package.json packages/observability/package.json
```

and change the build line to:

```dockerfile
RUN pnpm --filter "@photoops/photo-service..." build
```

- [ ] **Step 6: Install, typecheck, test**

Run: `pnpm install && pnpm --filter @photoops/photo-service typecheck && pnpm --filter @photoops/photo-service test`
Expected: clean; existing tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/photo-service pnpm-lock.yaml
git commit -m "feat(photo-service): structured pino logging + OTel + gRPC interceptor"
```

---

## Task 8: photo-service bridge — traceparent over the async hop

Stamp the active traceparent into `correlation_id` on publish, re-bind it on
result consume, and route the finalize log through pino so it carries
`trace_id`.

**Files:**
- Modify: `apps/photo-service/src/photo/photo.service.ts`
- Modify: `apps/photo-service/src/photo/processing.consumer.ts`
- Modify: `apps/photo-service/src/app.module.ts`
- Test: `apps/photo-service/src/photo/photo.service.spec.ts`
- Test: `apps/photo-service/src/photo/processing.consumer.spec.ts`

**Interfaces:**
- Consumes: `currentTraceparent`, `withExtractedContext` from
  `@photoops/observability`; `PinoLogger` from `nestjs-pino`.
- Produces: `new PhotoDomainService(repository, storage, publisher, logger)` —
  fourth arg is a `PinoLogger` (or compatible `{ info }`).

- [ ] **Step 1: Write the failing publish test**

Add to `apps/photo-service/src/photo/photo.service.spec.ts`. First extend the
`createService()` helper to pass a stub logger as the 4th constructor arg:

```ts
// inside createService(), after building repository/storage/publisher:
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), setContext: vi.fn() };
  const service = new PhotoDomainService(repository, storage, publisher, logger as never);
  return { service, repository, storage, publisher, logger };
```

Then add a test that, with an active span, the published `correlationId` is that
span's traceparent:

```ts
import { context, trace } from '@opentelemetry/api';

it('publishes the active traceparent as the job correlation id', async () => {
  const { service, repository, storage, publisher } = createService();
  repository.findByIdForUser.mockResolvedValue(makePhotoRecord({ status: 'uploaded' }));
  storage.objectExists.mockResolvedValue(true);
  repository.markUploadedForUser.mockResolvedValue(makePhotoRecord({ status: 'uploaded' }));
  repository.markProcessingForUser.mockResolvedValue(true);
  repository.createProcessingJob.mockResolvedValue({ id: 'job-1' });

  const sc = { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 };
  const span = trace.wrapSpanContext(sc);
  await context.with(trace.setSpan(context.active(), span), () =>
    service.completeUpload('user-1', 'photo-1')
  );

  const published = publisher.publish.mock.calls[0][1];
  expect(published.correlationId).toBe(`00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`);
});
```

(Adjust the existing tests that call `createService()` to read `service` from the
returned object if they previously received the service directly.)

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @photoops/photo-service test src/photo/photo.service.spec.ts`
Expected: FAIL — correlationId is a uuid, not the traceparent; constructor arity.

- [ ] **Step 3: Implement the publish-side bridge + pino finalize log**

In `apps/photo-service/src/photo/photo.service.ts`:

Add imports:

```ts
import { PinoLogger } from 'nestjs-pino';
import { currentTraceparent } from '@photoops/observability';
```

Add the logger to the constructor:

```ts
  constructor(
    private readonly repository: PhotoRepositoryPort,
    private readonly storage: ObjectStoragePort,
    private readonly publisher: MessagePublisher,
    private readonly logger: PinoLogger
  ) {}
```

Replace the correlation id source (line ~90):

```ts
      const correlationId = currentTraceparent() ?? uuidv7();
```

Replace the `console.log(JSON.stringify({ ... }))` block in `finalizeResult`
(lines ~182-189) with a pino call (trace_id is added by the mixin):

```ts
    this.logger.info(
      {
        msg: 'processing.finalized',
        correlation_id: result.correlationId ?? null,
        job_id: result.jobId,
        photo_id: result.photoId,
        outcome: result.outcome
      },
      'processing.finalized'
    );
```

- [ ] **Step 4: Inject `PinoLogger` in the photo `AppModule` factory**

`apps/photo-service/src/app.module.ts` — add `PinoLogger` to the
`PhotoDomainService` factory:

```ts
import { PinoLogger } from 'nestjs-pino';
// ...
    {
      provide: PhotoDomainService,
      useFactory: (repository: PhotoRepository, storage: MinioStorageService, publisher: MessagePublisher, logger: PinoLogger) =>
        new PhotoDomainService(repository, storage, publisher, logger),
      inject: [PhotoRepository, MinioStorageService, MESSAGE_PUBLISHER, PinoLogger]
    },
```

- [ ] **Step 5: Run the publish test**

Run: `pnpm --filter @photoops/photo-service test src/photo/photo.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing consumer test**

Add to `apps/photo-service/src/photo/processing.consumer.spec.ts` a test that the
finalize handler runs inside the extracted trace context. Register the W3C
propagator and assert the active trace id during finalize:

```ts
import { beforeAll, expect, it, vi } from 'vitest';
import { propagation, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { ProcessingResultConsumer, PROCESS_RESULT_SOURCE } from './processing.consumer';
import { InMemoryBus } from '../messaging/in-memory-bus';
import { encodeResultForTest } from './processing.codec'; // see note below

beforeAll(() => propagation.setGlobalPropagator(new W3CTraceContextPropagator()));

it('finalizes within the trace context carried by correlation_id', async () => {
  let seenTraceId: string | undefined;
  const service = {
    finalizeResult: vi.fn(async () => {
      seenTraceId = trace.getActiveSpan()?.spanContext().traceId;
    })
  };
  const bus = new InMemoryBus();
  const consumer = new ProcessingResultConsumer(bus, service);
  await consumer.start();

  const tp = `00-${'e'.repeat(32)}-${'f'.repeat(16)}-01`;
  // A real serialized PhotoProcessingResult whose correlation_id == tp.
  const body = encodeResultForTest({ jobId: 'j', photoId: 'p', correlationId: tp });
  await bus.publish(PROCESS_RESULT_SOURCE, { body, correlationId: tp });

  expect(seenTraceId).toBe('e'.repeat(32));
});
```

> Note: the existing consumer spec builds result bodies already (see
> `processing.consumer.spec.ts` lines ~37/66). Reuse that exact body-building
> approach instead of `encodeResultForTest` — the decoded `result.correlationId`
> must equal `tp`. The point of the test is `seenTraceId`, not the encoder.

- [ ] **Step 7: Run it and watch it fail**

Run: `pnpm --filter @photoops/photo-service test src/photo/processing.consumer.spec.ts`
Expected: FAIL — `seenTraceId` is undefined (no context binding yet).

- [ ] **Step 8: Bind the extracted context in the consumer**

`apps/photo-service/src/photo/processing.consumer.ts`:

```ts
import { MessageConsumer } from '../messaging/messaging.port';
import { decodeResult } from './processing.codec';
import { ProcessingResultInput } from './photo.types';
import { withExtractedContext } from '@photoops/observability';

export const PROCESS_RESULT_SOURCE = 'photo.result';

export interface FinalizeResultPort {
  finalizeResult(result: ProcessingResultInput): Promise<void>;
}

export class ProcessingResultConsumer {
  constructor(
    private readonly consumer: MessageConsumer,
    private readonly service: FinalizeResultPort
  ) {}

  async start(): Promise<void> {
    await this.consumer.consume(PROCESS_RESULT_SOURCE, async (msg) => {
      const result = decodeResult(msg.body);
      await withExtractedContext(result.correlationId, () => this.service.finalizeResult(result));
    });
  }
}
```

- [ ] **Step 9: Run both photo-service spec files + typecheck**

Run: `pnpm --filter @photoops/photo-service test && pnpm --filter @photoops/photo-service typecheck`
Expected: PASS, clean.

- [ ] **Step 10: Commit**

```bash
git add apps/photo-service/src
git commit -m "feat(photo-service): bridge trace context over AMQP via correlation_id"
```

---

## Task 9: media-worker structured JSON logging + job context binding

Replace the worker's `basicConfig` + hand-rolled `json.dumps` logs with a
dependency-free JSON formatter and a `contextvars`-bound `trace_id`/`correlation_id`.

> Deviation from spec: the spec named `python-json-logger`; this plan uses a
> ~20-line dependency-free `logging.Formatter` instead — same outcome (a stdlib
> JSON formatter), no new dependency, and it sidesteps the 2.x/3.x import-path
> churn. Both satisfy the spec's "minimal change: a stdlib-logging formatter".

**Files:**
- Create: `apps/media-worker/src/media_worker/logging_setup.py`
- Modify: `apps/media-worker/src/main.py`
- Modify: `apps/media-worker/src/media_worker/handler.py`
- Test: `apps/media-worker/tests/test_logging_setup.py`

**Interfaces:**
- Produces:
  - `setup_logging(service: str = "media-worker") -> None`
  - `bind_job_context(correlation_id: str) -> None`
  - `clear_job_context() -> None`
  - `trace_id_from_traceparent(traceparent: str) -> str`

- [ ] **Step 1: Write the failing test**

`apps/media-worker/tests/test_logging_setup.py`:

```python
import json
import logging

from src.media_worker.logging_setup import (
    JsonLogFormatter,
    bind_job_context,
    clear_job_context,
    trace_id_from_traceparent,
)


def format_record(msg: str, extra: dict | None = None) -> dict:
    logger = logging.getLogger("test")
    record = logger.makeRecord("test", logging.INFO, __file__, 0, msg, (), None)
    for k, v in (extra or {}).items():
        setattr(record, k, v)
    return json.loads(JsonLogFormatter().format(record))


def test_trace_id_from_traceparent():
    tp = "00-" + "a" * 32 + "-" + "b" * 16 + "-01"
    assert trace_id_from_traceparent(tp) == "a" * 32
    assert trace_id_from_traceparent("") == ""
    assert trace_id_from_traceparent("garbage") == ""


def test_formatter_envelope():
    clear_job_context()
    out = format_record("job.started", {"job_id": "j1"})
    assert out["msg"] == "job.started"
    assert out["level"] == "info"
    assert out["service"] == "media-worker"
    assert out["job_id"] == "j1"
    assert out["trace_id"] == ""
    assert out["correlation_id"] == ""


def test_bind_job_context_sets_ids():
    tp = "00-" + "c" * 32 + "-" + "d" * 16 + "-01"
    bind_job_context(tp)
    try:
        out = format_record("job.succeeded")
        assert out["correlation_id"] == tp
        assert out["trace_id"] == "c" * 32
    finally:
        clear_job_context()
```

- [ ] **Step 2: Run it and watch it fail**

Run: `make test-media-worker`
Expected: FAIL — `logging_setup` module does not exist.

- [ ] **Step 3: Implement `logging_setup.py`**

`apps/media-worker/src/media_worker/logging_setup.py`:

```python
"""Structured JSON logging for the media-worker.

A dependency-free stdlib formatter emits one JSON object per record with a
consistent envelope (service/level/time/msg) plus the contextvars-bound
correlation_id/trace_id and any `extra` fields. bind_job_context() is called
at the start of handling a job so every line for that job is correlated.
"""
from __future__ import annotations

import contextvars
import json
import logging
import os
from typing import Any

_SERVICE = "media-worker"
_correlation_id: contextvars.ContextVar[str] = contextvars.ContextVar("correlation_id", default="")
_trace_id: contextvars.ContextVar[str] = contextvars.ContextVar("trace_id", default="")

# Standard LogRecord attributes we do NOT copy into the JSON envelope as extras.
_RESERVED = set(logging.makeLogRecord({}).__dict__) | {"message", "asctime", "taskName"}


def trace_id_from_traceparent(traceparent: str) -> str:
    """Extract the 32-hex trace id from a W3C traceparent, or '' if malformed."""
    parts = traceparent.split("-")
    if len(parts) == 4 and len(parts[1]) == 32:
        return parts[1]
    return ""


def bind_job_context(correlation_id: str) -> None:
    """Bind the job's correlation id (a W3C traceparent) for subsequent logs."""
    _correlation_id.set(correlation_id or "")
    _trace_id.set(trace_id_from_traceparent(correlation_id or ""))


def clear_job_context() -> None:
    _correlation_id.set("")
    _trace_id.set("")


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "time": int(record.created * 1000),
            "level": record.levelname.lower(),
            "service": _SERVICE,
            "msg": record.getMessage(),
            "trace_id": _trace_id.get(),
            "correlation_id": _correlation_id.get(),
        }
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["error"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def setup_logging(service: str = _SERVICE) -> None:
    """Configure the root logger to emit JSON at LOG_LEVEL (default INFO)."""
    level = os.getenv("LOG_LEVEL", "info").upper()
    handler = logging.StreamHandler()
    handler.setFormatter(JsonLogFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)
```

- [ ] **Step 4: Run the test**

Run: `make test-media-worker`
Expected: PASS (the three new tests, plus existing suite still green).

- [ ] **Step 5: Use it in `main.py`**

`apps/media-worker/src/main.py`:

```python
"""Media-worker entry point.

Configures structured logging and starts the RabbitMQ consume loop.
"""
from media_worker.app import run
from media_worker.config import load
from media_worker.logging_setup import setup_logging

if __name__ == "__main__":
    setup_logging()
    run(load())
```

- [ ] **Step 6: Bind context + use `extra` in `handler.py`**

In `apps/media-worker/src/media_worker/handler.py`:

Add the import:

```python
from .logging_setup import bind_job_context, clear_job_context
```

At the very start of `handle()`, bind the message's correlation id, and clear it
at the end (wrap the body in try/finally):

```python
    def handle(self, message: BusMessage) -> None:
        bind_job_context(message.correlation_id)
        try:
            self._handle(message)
        finally:
            clear_job_context()

    def _handle(self, message: BusMessage) -> None:
        # ... existing body of the old handle() ...
```

Replace the three `log.error(json.dumps({...}))` / `log.info(json.dumps({...}))`
calls with structured calls that pass fields via `extra` (the formatter adds the
envelope + trace_id/correlation_id):

```python
        # decode failure
        log.error("job.failed", extra={"job_id": "", "photo_id": "", "error": str(exc)})
```

```python
        # process failure
        log.error("job.failed", extra={"job_id": job.job_id, "photo_id": job.photo_id, "error": str(exc)})
```

```python
        # success
        log.info(
            "job.succeeded",
            extra={"job_id": job.job_id, "photo_id": job.photo_id, "variants": [v.variant_type for v in variants]},
        )
```

(Remove the now-unused `import json` if nothing else in the file uses it.)

- [ ] **Step 7: Run worker lint + tests**

Run: `make gate-media`
Expected: ruff + mypy clean; pytest PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/media-worker/src apps/media-worker/tests
git commit -m "feat(media-worker): structured JSON logs + trace_id from correlation_id"
```

---

## Task 10: LOG_LEVEL config + compose wiring

Expose `LOG_LEVEL` as a documented env var and pass it to all four services in
compose.

**Files:**
- Modify: `.env.example`
- Modify: `infra/docker/docker-compose.yml`

- [ ] **Step 1: Add `LOG_LEVEL` to `.env.example`**

Append after the `SESSION_COOKIE_SECURE=false` line:

```bash
LOG_LEVEL=info
```

- [ ] **Step 2: Pass `LOG_LEVEL` to each service in compose**

In `infra/docker/docker-compose.yml`, add `LOG_LEVEL: ${LOG_LEVEL:-info}` to the
`environment:` block of `api-gateway`, `identity-service`, `photo-service`, and
`media-worker`. Example for `photo-service`:

```yaml
    environment:
      LOG_LEVEL: ${LOG_LEVEL:-info}
      PHOTO_DATABASE_URL: ${PHOTO_DATABASE_URL}
      # ... existing entries unchanged ...
```

- [ ] **Step 3: Validate the compose file parses**

Run: `docker compose -f infra/docker/docker-compose.yml --env-file .env config >/dev/null && echo ok`
Expected: `ok` (no YAML/interpolation errors). (Requires a `.env`; `cp .env.example .env` first if absent.)

- [ ] **Step 4: Commit**

```bash
git add .env.example infra/docker/docker-compose.yml
git commit -m "chore(obs): expose LOG_LEVEL env across services"
```

---

## Task 11: End-to-end verification, docs, and durable knowledge

Prove cross-service trace_id continuity and no-secrets, then record the seam in
the project's knowledge surfaces.

**Files:**
- Create: `docs/e2e-structured-logging.md`
- Modify: `scripts/smoke-stack.sh` (best-effort assertion; inspect first)
- Modify: `apps/api-gateway/CLAUDE.md`, `apps/identity-service/CLAUDE.md`,
  `apps/photo-service/CLAUDE.md`, `apps/media-worker/CLAUDE.md`
- Modify: `docs/architecture.md`
- Modify: `README.md`

- [ ] **Step 1: Write the manual e2e scenario doc**

`docs/e2e-structured-logging.md` — document the procedure and expected result:

```markdown
# E2E: Structured Logging + Trace Correlation

Preconditions: `make dev` and `make migrate` are running.

1. Sign up and upload a JPEG via the web app (or `make smoke-stack`).
2. Capture logs: `make logs > /tmp/photoops.logs` (or `make logs-svc svc=...`).
3. Pick one request's trace id:
   `grep -o '"trace_id":"[a-f0-9]\{32\}"' /tmp/photoops.logs | sort | uniq -c`
4. Confirm the SAME trace_id appears in api-gateway, identity-service, and
   photo-service lines, and that the photo→worker chain shares it
   (media-worker `trace_id` parsed from the job's `correlation_id`).
5. Confirm NO secrets: the following must return nothing:
   `grep -Ei '"(cookie|authorization|password|passwordHash|uploadUrl)":"(?!\[REDACTED\])' /tmp/photoops.logs`
   and no raw `X-Amz-Signature` / presigned PUT URL appears.

Pass: one trace_id threads gateway → identity/photo → worker; no secret values
in any line.
```

- [ ] **Step 2: Add a best-effort assertion to `smoke-stack.sh`**

Read `scripts/smoke-stack.sh` first. After its existing upload/processing
round-trip, before teardown, capture compose logs and assert a single trace_id
spans services and no secrets leak. Append a step like:

```bash
LOGS="$($DC logs --no-color 2>/dev/null)"
TRACE="$(printf '%s' "$LOGS" | grep -oE '"trace_id":"[a-f0-9]{32}"' | sort | uniq -c | sort -rn | head -1)"
echo "smoke-stack: dominant trace line -> ${TRACE:-none}"
if printf '%s' "$LOGS" | grep -Eiq '"(password|passwordHash|cookie|authorization|uploadUrl)":"(\[REDACTED\])?"'; then
  printf '%s' "$LOGS" | grep -Ei '"(password|passwordHash|cookie|authorization|uploadUrl)":"[^]]' && {
    echo "smoke-stack: SECRET LEAK in logs"; exit 1; }
fi
echo "smoke-stack: no unredacted secrets in logs"
```

> If wiring this cleanly into the script proves fiddly, keep the assertion in the
> manual e2e doc only (the spec permits this fallback) and note it in the
> handoff. Do not block the task on it.

- [ ] **Step 3: Run the smoke stack (local only)**

Run: `make smoke-stack`
Expected: existing media round-trip passes; the new lines print a dominant
trace_id and "no unredacted secrets in logs".

- [ ] **Step 4: Update nested `CLAUDE.md` files**

Add a short "Logging / correlation" note to each service's `CLAUDE.md`
`## Local context`:

- `apps/api-gateway/CLAUDE.md`: "Structured JSON via `nestjs-pino`
  (`makeLoggerOptions` from `@photoops/observability`); OTel propagation started
  in `src/tracing.ts`; HTTP requests auto-logged; mapped errors logged by
  `HttpErrorFilter` (4xx warn / 5xx error)."
- `apps/identity-service/CLAUDE.md` & `apps/photo-service/CLAUDE.md`: same logger
  note + "per-RPC lines via `GrpcLoggingInterceptor`."
- `apps/photo-service/CLAUDE.md`: add the bridge invariant — "the async hop
  carries the W3C traceparent in the proto `correlation_id` field
  (`currentTraceparent()` on publish, `withExtractedContext()` on result
  consume); `job_id` stays the idempotency key."
- `apps/media-worker/CLAUDE.md`: "Structured JSON via `logging_setup.py`;
  `bind_job_context()` parses `trace_id` from the job's `correlation_id`."

- [ ] **Step 5: Update `docs/architecture.md` Current Build State**

Add a bullet under "Current Build State":

```markdown
- Observability: structured JSON logs across all services with an OpenTelemetry
  trace-context correlation id propagated over HTTP/gRPC/AMQP (propagation only;
  no exporter/backend — that is `pb6`). Secrets are redacted centrally in
  `@photoops/observability`.
```

- [ ] **Step 6: Update `README.md` Verification**

Add a line under Verification mentioning `LOG_LEVEL` (default `info`) and the
trace_id check in `docs/e2e-structured-logging.md`.

- [ ] **Step 7: Record durable knowledge**

```bash
bd remember "Structured logging (zg6): @photoops/observability holds the propagation-only OTel bootstrap (startTracing), pino options with the single REDACT_PATHS list + trace_id/span_id mixin, traceparent bridge helpers (currentTraceparent/withExtractedContext), and GrpcLoggingInterceptor. TS services use nestjs-pino. The async hop carries the FULL W3C traceparent in the proto correlation_id field (photo-service stamps it on publish, re-binds on result consume); job_id stays the idempotency key. media-worker logs trace_id parsed from correlation_id with no Python OTel SDK (that is pb6). No exporter/backend — propagation + log correlation only."
```

- [ ] **Step 8: Full gate**

Run: `make gate`
Expected: `gate: all checks passed (TS + media-worker)`.

- [ ] **Step 9: Commit**

```bash
git add docs apps/*/CLAUDE.md README.md scripts/smoke-stack.sh
git commit -m "docs(zg6): e2e logging scenario, service notes, architecture seam"
```

---

## Self-Review

**Spec coverage:**
- Structured JSON in all 4 services → Tasks 4, 6, 7, 9. ✓
- OTel propagation-only (no exporter) → Task 2 (`startTracing`), Global Constraints. ✓
- trace_id/span_id on every line → Task 1 (`traceMixin`). ✓
- web→gateway edge generates/accepts traceparent → Task 4 (HttpInstrumentation). ✓
- gRPC propagation → Tasks 6/7 (GrpcInstrumentation, auto). ✓
- AMQP bridge via correlation_id=traceparent → Task 8. ✓
- media-worker light include (no Python OTel) → Task 9. ✓
- Redaction (cookie/auth/password/presigned) → Task 1 (`REDACT_PATHS`) + test. ✓
- Consistent levels → Task 5 (filter 4xx/5xx), level map in Global Constraints/logger. ✓
- LOG_LEVEL config → Tasks 1/9 (read) + Task 10 (env/compose). ✓
- gRPC per-RPC lines → Task 3 + Tasks 6/7. ✓
- Tests (redaction, mixin, traceparent, interceptor, python, smoke) → Tasks 1,2,3,8,9,11. ✓
- Docs/CLAUDE.md/bd remember → Task 11. ✓

**Placeholder scan:** No TBD/TODO. The only deliberate "inspect then integrate"
is Task 11 Step 2 (smoke-stack), with an explicit manual-doc fallback the spec
permits.

**Type consistency:** `makeLoggerOptions(serviceName)`, `startTracing(serviceName)`,
`currentTraceparent()`, `withExtractedContext(tp, fn)`, `GrpcLoggingInterceptor`,
`PhotoDomainService(repository, storage, publisher, logger)`, Python
`setup_logging`/`bind_job_context`/`clear_job_context`/`trace_id_from_traceparent`
are used consistently across tasks.
```
