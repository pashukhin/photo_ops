import { Injectable, UnauthorizedException } from '@nestjs/common';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { parse } from 'cookie';
import { AuthSessionDto, IdentityClient } from '../grpc/identity.client';
import { SESSION_COOKIE_NAME } from './session-cookie';

@Injectable()
export class AuthService {
  constructor(private readonly identityClient: IdentityClient) {}

  async requireSession(cookieHeader: string | undefined): Promise<AuthSessionDto> {
    const sessionId = this.readSessionId(cookieHeader);
    if (!sessionId) {
      throw new UnauthorizedException('authentication required');
    }
    try {
      return await this.identityClient.validateSession({ sessionId });
    } catch (error) {
      if (this.isGrpcUnauthenticated(error)) {
        throw new UnauthorizedException('authentication required');
      }
      throw error;
    }
  }

  readSessionId(cookieHeader: string | undefined) {
    return cookieHeader ? parse(cookieHeader)[SESSION_COOKIE_NAME] : undefined;
  }

  private isGrpcUnauthenticated(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === GrpcStatus.UNAUTHENTICATED;
  }
}
