import { Inject, Injectable, Optional } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { createDb } from '../db/client';
import { passwordCredentials, sessions, users } from '../db/schema';
import { AuthSessionRecord, SessionRecord, UserRecord } from './identity.types';
import { IdentityRepositoryPort } from './identity.service';

@Injectable()
export class IdentityRepository implements IdentityRepositoryPort {
  private readonly db: ReturnType<typeof createDb>;

  constructor(@Optional() @Inject('IDENTITY_DB') db?: ReturnType<typeof createDb>) {
    this.db = db ?? createDb();
  }

  async createUserWithPassword(input: { email: string; passwordHash: string; displayName: string }): Promise<UserRecord> {
    const id = uuidv7();
    return this.db.transaction(async (tx) => {
      const [created] = await tx.insert(users).values({ id, email: input.email, displayName: input.displayName, status: 'active' }).returning();
      await tx.insert(passwordCredentials).values({ userId: id, passwordHash: input.passwordHash });
      return this.toUser(created);
    });
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return row ? this.toUser(row) : null;
  }

  async findPasswordHash(userId: string): Promise<string | null> {
    const [row] = await this.db.select().from(passwordCredentials).where(eq(passwordCredentials.userId, userId)).limit(1);
    return row?.passwordHash ?? null;
  }

  async createSession(input: { userId: string; expiresAt: Date }): Promise<SessionRecord> {
    const [created] = await this.db.insert(sessions).values({ id: uuidv7(), userId: input.userId, expiresAt: input.expiresAt }).returning();
    return this.toSession(created);
  }

  async findSessionWithUser(sessionId: string): Promise<AuthSessionRecord | null> {
    const [row] = await this.db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, sessionId))
      .limit(1);
    return row ? { session: this.toSession(row.session), user: this.toUser(row.user) } : null;
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
  }

  private toUser(row: typeof users.$inferSelect): UserRecord {
    return { id: row.id, email: row.email, displayName: row.displayName, status: row.status as UserRecord['status'], createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  private toSession(row: typeof sessions.$inferSelect): SessionRecord {
    return { id: row.id, userId: row.userId, expiresAt: row.expiresAt, createdAt: row.createdAt, revokedAt: row.revokedAt ?? null };
  }
}
