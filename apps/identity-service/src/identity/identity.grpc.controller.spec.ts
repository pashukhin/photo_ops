import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { describe, expect, it, vi } from 'vitest';
import { IdentityGrpcController } from './identity.grpc.controller';

function createController() {
  const identity = {
    signUp: vi.fn(),
    login: vi.fn(),
    validateSession: vi.fn(),
    logout: vi.fn()
  };
  return { controller: new IdentityGrpcController(identity as never), identity };
}

async function expectRpcError(action: Promise<unknown>, code: status, message: string) {
  try {
    await action;
    throw new Error('expected rpc exception');
  } catch (error) {
    expect(error).toBeInstanceOf(RpcException);
    expect((error as RpcException).getError()).toEqual({ code, message });
  }
}

describe('IdentityGrpcController', () => {
  it('maps invalid login credentials to unauthenticated', async () => {
    const { controller, identity } = createController();
    identity.login.mockRejectedValue(new Error('invalid credentials'));

    await expectRpcError(controller.login({ email: 'person@example.com', password: 'wrong-password' }), status.UNAUTHENTICATED, 'invalid credentials');
  });

  it('maps invalid sessions to unauthenticated', async () => {
    const { controller, identity } = createController();
    identity.validateSession.mockRejectedValue(new Error('invalid session'));

    await expectRpcError(controller.validateSession({ sessionId: 'missing-session' }), status.UNAUTHENTICATED, 'invalid session');
  });

  it('maps short signup passwords to invalid argument', async () => {
    const { controller, identity } = createController();
    identity.signUp.mockRejectedValue(new Error('password too short'));

    await expectRpcError(controller.signUp({ email: 'person@example.com', password: 'short', displayName: 'Person' }), status.INVALID_ARGUMENT, 'password too short');
  });
});
