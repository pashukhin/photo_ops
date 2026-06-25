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
            { rpc, outcome: 'error', duration_ms: Date.now() - start, err_code: err?.code ?? null },
            'grpc.request'
          )
      })
    );
  }
}
