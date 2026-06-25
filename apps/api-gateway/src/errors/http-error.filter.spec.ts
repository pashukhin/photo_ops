import { ArgumentsHost, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { describe, expect, it, vi } from 'vitest';
import { HttpErrorFilter } from './http-error.filter';

function createHost() {
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn()
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response })
  } as unknown as ArgumentsHost;
  return { host, response };
}

function fakeLogger() {
  return { warn: vi.fn(), error: vi.fn() } as unknown as import('pino').Logger;
}

describe('HttpErrorFilter', () => {
  it('preserves UnauthorizedException as a 401 response', () => {
    const { host, response } = createHost();

    new HttpErrorFilter().catch(new UnauthorizedException('authentication required'), host);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({ code: 'unauthorized', message: 'authentication required' });
  });

  it('maps gRPC already-exists errors to a conflict response', () => {
    const { host, response } = createHost();
    const error = Object.assign(new Error('6 ALREADY_EXISTS: email already exists'), {
      code: status.ALREADY_EXISTS,
      details: 'email already exists'
    });

    new HttpErrorFilter().catch(error, host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({ code: 'conflict', message: 'email already exists' });
  });

  it('maps gRPC unauthenticated errors to an unauthorized response', () => {
    const { host, response } = createHost();
    const error = Object.assign(new Error('16 UNAUTHENTICATED: invalid credentials'), {
      code: status.UNAUTHENTICATED,
      details: 'invalid credentials'
    });

    new HttpErrorFilter().catch(error, host);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({ code: 'unauthorized', message: 'invalid credentials' });
  });

  it('maps gRPC not-found errors to a not-found response', () => {
    const { host, response } = createHost();
    const error = Object.assign(new Error('5 NOT_FOUND: photo not found'), {
      code: status.NOT_FOUND,
      details: 'photo not found'
    });

    new HttpErrorFilter().catch(error, host);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({ code: 'not_found', message: 'photo not found' });
  });

  it('maps gRPC invalid-argument errors to a bad-request response', () => {
    const { host, response } = createHost();
    const error = Object.assign(new Error('3 INVALID_ARGUMENT: password too short'), {
      code: status.INVALID_ARGUMENT,
      details: 'password too short'
    });

    new HttpErrorFilter().catch(error, host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ code: 'bad_request', message: 'password too short' });
  });
});

describe('HttpErrorFilter logging', () => {
  it('logs 4xx as warn', () => {
    const logger = fakeLogger();
    new HttpErrorFilter(logger).catch(
      new HttpException('nope', HttpStatus.UNAUTHORIZED),
      createHost().host
    );
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs unexpected errors as error', () => {
    const logger = fakeLogger();
    new HttpErrorFilter(logger).catch(new Error('boom'), createHost().host);
    expect(logger.error).toHaveBeenCalled();
  });
});
