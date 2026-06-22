import { ArgumentsHost, UnauthorizedException } from '@nestjs/common';
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

describe('HttpErrorFilter', () => {
  it('preserves UnauthorizedException as a 401 response', () => {
    const { host, response } = createHost();

    new HttpErrorFilter().catch(new UnauthorizedException('authentication required'), host);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({ code: 'unauthorized', message: 'authentication required' });
  });
});
