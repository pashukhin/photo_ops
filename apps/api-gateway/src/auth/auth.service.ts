import { Injectable, UnauthorizedException } from '@nestjs/common';
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
    } catch {
      throw new UnauthorizedException('authentication required');
    }
  }

  readSessionId(cookieHeader: string | undefined) {
    return cookieHeader ? parse(cookieHeader)[SESSION_COOKIE_NAME] : undefined;
  }
}
