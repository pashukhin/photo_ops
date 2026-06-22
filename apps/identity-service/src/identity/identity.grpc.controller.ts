import { status } from '@grpc/grpc-js';
import { Controller } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { AuthSessionRecord, UserRecord } from './identity.types';
import { IdentityDomainService } from './identity.service';

@Controller()
export class IdentityGrpcController {
  constructor(private readonly identity: IdentityDomainService) {}

  @GrpcMethod('IdentityService', 'Health')
  health() {
    return { status: 'ok', service: 'identity-service' };
  }

  @GrpcMethod('IdentityService', 'SignUp')
  async signUp(request: { email: string; password: string; displayName: string }) {
    try {
      return this.mapAuth(await this.identity.signUp({ email: request.email, password: request.password, displayName: request.displayName }));
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  @GrpcMethod('IdentityService', 'Login')
  async login(request: { email: string; password: string }) {
    try {
      return this.mapAuth(await this.identity.login({ email: request.email, password: request.password }));
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  @GrpcMethod('IdentityService', 'ValidateSession')
  async validateSession(request: { sessionId: string }) {
    try {
      return this.mapAuth(await this.identity.validateSession(request.sessionId));
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  @GrpcMethod('IdentityService', 'Logout')
  async logout(request: { sessionId: string }) {
    await this.identity.logout(request.sessionId);
    return {};
  }

  @GrpcMethod('IdentityService', 'GetCurrentUser')
  async getCurrentUser(request: { sessionId: string }) {
    try {
      const auth = await this.identity.validateSession(request.sessionId);
      return this.mapUser(auth.user);
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  private mapDomainError(error: unknown) {
    if (error instanceof Error) {
      if (error.message === 'email already exists') {
        return new RpcException({ code: status.ALREADY_EXISTS, message: error.message });
      }
      if (error.message === 'password too short') {
        return new RpcException({ code: status.INVALID_ARGUMENT, message: error.message });
      }
      if (error.message === 'invalid credentials' || error.message === 'user disabled' || error.message === 'invalid session') {
        return new RpcException({ code: status.UNAUTHENTICATED, message: error.message });
      }
    }
    return error;
  }

  private mapAuth(auth: AuthSessionRecord) {
    return { sessionId: auth.session.id, userId: auth.user.id, email: auth.user.email, displayName: auth.user.displayName, expiresAt: auth.session.expiresAt.toISOString() };
  }

  private mapUser(user: UserRecord) {
    const statusMap = { active: 1, disabled: 2 } as const;
    return { id: user.id, email: user.email, displayName: user.displayName, status: statusMap[user.status], createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString() };
  }
}
