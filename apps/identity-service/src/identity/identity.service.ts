import { Injectable } from '@nestjs/common';
import { AuthSessionRecord, LoginInput, SessionRecord, SignUpInput, UserRecord } from './identity.types';

const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export interface IdentityRepositoryPort {
  createUserWithPassword(input: { email: string; passwordHash: string; displayName: string }): Promise<UserRecord>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findPasswordHash(userId: string): Promise<string | null>;
  createSession(input: { userId: string; expiresAt: Date }): Promise<SessionRecord>;
  findSessionWithUser(sessionId: string): Promise<AuthSessionRecord | null>;
  revokeSession(sessionId: string): Promise<void>;
}

export interface PasswordServicePort {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

@Injectable()
export class IdentityDomainService {
  constructor(
    private readonly repository: IdentityRepositoryPort,
    private readonly passwords: PasswordServicePort,
    private readonly now: () => Date = () => new Date()
  ) {}

  async signUp(input: SignUpInput): Promise<AuthSessionRecord> {
    const email = this.normalizeEmail(input.email);
    if (input.password.length < 8) {
      throw new Error('password too short');
    }
    const existing = await this.repository.findUserByEmail(email);
    if (existing) {
      throw new Error('email already exists');
    }
    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.repository.createUserWithPassword({ email, passwordHash, displayName: input.displayName.trim() || email });
    const session = await this.repository.createSession({ userId: user.id, expiresAt: this.sessionExpiry() });
    return { user, session };
  }

  async login(input: LoginInput): Promise<AuthSessionRecord> {
    const email = this.normalizeEmail(input.email);
    const user = await this.repository.findUserByEmail(email);
    if (!user) {
      throw new Error('invalid credentials');
    }
    if (user.status === 'disabled') {
      throw new Error('user disabled');
    }
    const passwordHash = await this.repository.findPasswordHash(user.id);
    if (!passwordHash || !(await this.passwords.verify(passwordHash, input.password))) {
      throw new Error('invalid credentials');
    }
    const session = await this.repository.createSession({ userId: user.id, expiresAt: this.sessionExpiry() });
    return { user, session };
  }

  async validateSession(sessionId: string): Promise<AuthSessionRecord> {
    const auth = await this.repository.findSessionWithUser(sessionId);
    if (!auth || auth.session.revokedAt || auth.session.expiresAt <= this.now() || auth.user.status !== 'active') {
      throw new Error('invalid session');
    }
    return auth;
  }

  async logout(sessionId: string): Promise<void> {
    await this.repository.revokeSession(sessionId);
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private sessionExpiry() {
    return new Date(this.now().getTime() + SESSION_TTL_MS);
  }
}
