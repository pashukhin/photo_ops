import { Body, Controller, Get, Headers, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { serializeClearedSessionCookie, serializeSessionCookie } from '../auth/session-cookie';
import { AuthSessionDto, IdentityClient } from '../grpc/identity.client';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly identityClient: IdentityClient,
    private readonly authService: AuthService
  ) {}

  @Post('signup')
  async signUp(@Body() body: { email: string; password: string; displayName: string }, @Res({ passthrough: true }) response: Response) {
    const auth = await this.identityClient.signUp(body);
    this.setSessionCookie(response, auth);
    return this.publicAuth(auth);
  }

  @Post('login')
  async login(@Body() body: { email: string; password: string }, @Res({ passthrough: true }) response: Response) {
    const auth = await this.identityClient.login(body);
    this.setSessionCookie(response, auth);
    return this.publicAuth(auth);
  }

  @Post('logout')
  async logout(@Headers('cookie') cookieHeader: string | undefined, @Res({ passthrough: true }) response: Response) {
    const sessionId = this.authService.readSessionId(cookieHeader);
    if (sessionId) {
      await this.identityClient.logout({ sessionId });
    }
    response.setHeader('set-cookie', serializeClearedSessionCookie());
    return { ok: true };
  }

  @Get('me')
  async me(@Headers('cookie') cookieHeader: string | undefined) {
    const auth = await this.authService.requireSession(cookieHeader);
    return this.publicAuth(auth);
  }

  private setSessionCookie(response: Response, auth: AuthSessionDto) {
    response.setHeader('set-cookie', serializeSessionCookie(auth.sessionId, new Date(auth.expiresAt)));
  }

  private publicAuth(auth: AuthSessionDto) {
    return { userId: auth.userId, email: auth.email, displayName: auth.displayName };
  }
}
