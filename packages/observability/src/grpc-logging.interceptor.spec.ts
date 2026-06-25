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
