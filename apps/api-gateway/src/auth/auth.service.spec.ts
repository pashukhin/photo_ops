import { status } from '@grpc/grpc-js';
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';

function createService() {
  const identityClient = { validateSession: vi.fn() };
  return { service: new AuthService(identityClient as never), identityClient };
}

describe('AuthService', () => {
  it('maps invalid sessions to unauthorized', async () => {
    const { service, identityClient } = createService();
    identityClient.validateSession.mockRejectedValue(Object.assign(new Error('invalid session'), { code: status.UNAUTHENTICATED }));

    await expect(service.requireSession('photoops_session=session-1')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('propagates identity-service runtime failures', async () => {
    const { service, identityClient } = createService();
    identityClient.validateSession.mockRejectedValue(new Error('identity unavailable'));

    await expect(service.requireSession('photoops_session=session-1')).rejects.toThrow('identity unavailable');
  });
});
