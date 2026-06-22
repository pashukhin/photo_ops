# Identity Users Upload Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-user e-mail/password authentication and enforce per-user ownership for the existing upload/list slice.

**Architecture:** Add `identity-service` as a data-owning NestJS service with `identity-db`. `api-gateway` remains database-free, manages HTTP-only auth cookies, validates sessions through `identity-service`, and passes `userId` explicitly to `photo-service`. `photo-service` owns `photo_assets`, stores `user_id`, and filters/mutates photos only inside the authenticated user scope.

**Tech Stack:** pnpm workspace, NestJS, TypeScript, Vitest, Drizzle, PostgreSQL, gRPC/proto-loader, Buf, Docker Compose, MinIO, shell smoke tests.

---

## Preconditions

Start from `main` with no uncommitted work.

Run:

```bash
git status --short --branch
bd ready
```

Expected:

- `git status` shows `## main...origin/main` and no changed files.
- `bd ready` shows no blocking issue for this work, or a new issue is created and claimed before implementation.

Create and claim the implementation issue:

```bash
bd create --title="Add identity users and upload ownership" --description="Implement identity-service, e-mail/password signup/login, HTTP-only session cookie handling in api-gateway, user_id ownership in photo-service, web auth UI, and two-user smoke verification." --type=feature --priority=2
bd update <created-issue-id> --claim
```

Create the feature branch:

```bash
git switch -c feat/identity-users-upload-ownership
```

## File Structure

Create:

- `proto/identity/v1/identity_service.proto` - identity gRPC contract.
- `apps/identity-service/package.json` - package scripts and dependencies.
- `apps/identity-service/tsconfig.json` - TypeScript config.
- `apps/identity-service/nest-cli.json` - Nest build config.
- `apps/identity-service/Dockerfile` - Docker runtime for compose.
- `apps/identity-service/migrations/0001_create_identity_tables.sql` - identity schema.
- `apps/identity-service/src/db/schema.ts` - Drizzle identity table schema.
- `apps/identity-service/src/db/client.ts` - `IDENTITY_DATABASE_URL` DB client.
- `apps/identity-service/src/identity/identity.types.ts` - domain record/input types.
- `apps/identity-service/src/identity/identity.service.spec.ts` - identity domain tests.
- `apps/identity-service/src/identity/identity.service.ts` - identity domain logic.
- `apps/identity-service/src/identity/identity.repository.ts` - identity persistence.
- `apps/identity-service/src/identity/password.service.ts` - Argon2id hashing/verification.
- `apps/identity-service/src/identity/identity.grpc.controller.ts` - identity gRPC adapter.
- `apps/identity-service/src/health/health.controller.ts` - HTTP health endpoint.
- `apps/identity-service/src/app.module.ts` - Nest module.
- `apps/identity-service/src/main.ts` - HTTP + gRPC bootstrap.
- `apps/api-gateway/src/grpc/identity.client.ts` - gateway gRPC client for identity.
- `apps/api-gateway/src/auth/session-cookie.ts` - cookie constants and serialization.
- `apps/api-gateway/src/auth/auth.service.ts` - gateway session validation helper.
- `apps/api-gateway/src/http/auth.controller.ts` - public auth HTTP facade.
- `apps/api-gateway/src/http/auth.controller.spec.ts` - gateway auth tests.
- `scripts/smoke-auth-upload-ownership.sh` - two-user auth/upload smoke test.

Modify:

- `.env.example` - identity ports, DB URL, cookie settings.
- `package.json` - smoke test script order.
- `proto/buf.gen.yaml` if generation paths need no changes after adding identity proto.
- `proto/photo/v1/photo_service.proto` - add `user_id` to relevant photo requests and asset.
- `infra/postgres/init/001-create-databases.sql` - create `identity_user` and `identity_db`.
- `infra/docker/docker-compose.yml` - add `identity-service` and gateway env.
- `Makefile` - add `migrate-identity` and update smoke target if useful.
- `apps/photo-service/migrations/0001_create_photo_assets.sql` - include `user_id` for fresh local DBs.
- `apps/photo-service/src/db/schema.ts` - add `userId` column/index.
- `apps/photo-service/src/photo/photo.types.ts` - add `userId` to records/inputs.
- `apps/photo-service/src/photo/photo.service.spec.ts` - ownership tests.
- `apps/photo-service/src/photo/photo.service.ts` - user-scoped methods.
- `apps/photo-service/src/photo/photo.repository.ts` - user-scoped persistence.
- `apps/photo-service/src/photo/photo.grpc.controller.ts` - map `userId` request/response.
- `apps/api-gateway/package.json` - cookie parsing and test dependency additions if needed.
- `apps/api-gateway/src/app.module.ts` - register auth controller/service/client.
- `apps/api-gateway/src/http/photo.controller.ts` - require session and pass `userId`.
- `apps/api-gateway/src/http/photo.controller.spec.ts` - protected route tests.
- `apps/web/lib/api.ts` - auth endpoints and credentialed requests.
- `apps/web/app/page.tsx` - signup/login/logout UI around upload/list.
- `docs/architecture-frame-verification.md` - update verification commands and manual auth checks.

## Task 1: Identity Contract And Runtime Wiring

**Files:**

- Create: `proto/identity/v1/identity_service.proto`
- Modify: `.env.example`
- Modify: `infra/postgres/init/001-create-databases.sql`
- Modify: `infra/docker/docker-compose.yml`
- Modify: `Makefile`

- [ ] **Step 1: Add identity proto contract**

Create `proto/identity/v1/identity_service.proto`:

```proto
syntax = "proto3";

package photoops.identity.v1;

import "common/v1/common.proto";
import "google/api/annotations.proto";

service IdentityService {
  rpc Health(photoops.common.v1.HealthCheckRequest) returns (photoops.common.v1.HealthCheckResponse) {
    option (google.api.http) = {get: "/v1/identity/health"};
  }

  rpc SignUp(SignUpRequest) returns (AuthSession) {
    option (google.api.http) = {
      post: "/v1/auth/signup"
      body: "*"
    };
  }

  rpc Login(LoginRequest) returns (AuthSession) {
    option (google.api.http) = {
      post: "/v1/auth/login"
      body: "*"
    };
  }

  rpc ValidateSession(ValidateSessionRequest) returns (AuthSession) {
    option (google.api.http) = {
      post: "/v1/auth/session:validate"
      body: "*"
    };
  }

  rpc Logout(LogoutRequest) returns (photoops.common.v1.Empty) {
    option (google.api.http) = {
      post: "/v1/auth/logout"
      body: "*"
    };
  }

  rpc GetCurrentUser(GetCurrentUserRequest) returns (User) {
    option (google.api.http) = {get: "/v1/auth/me"};
  }
}

message SignUpRequest {
  string email = 1;
  string password = 2;
  string display_name = 3;
}

message LoginRequest {
  string email = 1;
  string password = 2;
}

message ValidateSessionRequest {
  string session_id = 1;
}

message LogoutRequest {
  string session_id = 1;
}

message GetCurrentUserRequest {
  string session_id = 1;
}

message AuthSession {
  string session_id = 1;
  string user_id = 2;
  string email = 3;
  string display_name = 4;
  string expires_at = 5;
}

message User {
  string id = 1;
  string email = 2;
  string display_name = 3;
  UserStatus status = 4;
  string created_at = 5;
  string updated_at = 6;
}

enum UserStatus {
  USER_STATUS_UNSPECIFIED = 0;
  USER_STATUS_ACTIVE = 1;
  USER_STATUS_DISABLED = 2;
}
```

- [ ] **Step 2: Generate proto code**

Run:

```bash
pnpm proto
```

Expected: exit `0`; generated TypeScript files under `packages/proto-ts/src/identity/v1/`.

- [ ] **Step 3: Add identity environment values**

Modify `.env.example` by adding these lines:

```dotenv
IDENTITY_SERVICE_HTTP_PORT=3005
IDENTITY_SERVICE_GRPC_PORT=50055
IDENTITY_DATABASE_URL=postgres://identity_user:identity_pass@postgres:5432/identity_db
IDENTITY_SESSION_COOKIE_NAME=photoops_session
SESSION_COOKIE_SECURE=false
```

- [ ] **Step 4: Add identity database bootstrap**

Modify `infra/postgres/init/001-create-databases.sql` to include identity before the other service databases:

```sql
CREATE USER identity_user WITH PASSWORD 'identity_pass';
CREATE DATABASE identity_db OWNER identity_user;
```

- [ ] **Step 5: Add identity service to Docker Compose**

Modify `infra/docker/docker-compose.yml` by adding the service before `photo-service`:

```yaml
  identity-service:
    build:
      context: ../..
      dockerfile: apps/identity-service/Dockerfile
    environment:
      IDENTITY_DATABASE_URL: ${IDENTITY_DATABASE_URL}
      IDENTITY_SERVICE_HTTP_PORT: ${IDENTITY_SERVICE_HTTP_PORT}
      IDENTITY_SERVICE_GRPC_PORT: ${IDENTITY_SERVICE_GRPC_PORT}
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "3005:3005"
      - "50055:50055"
```

Modify the `api-gateway` environment block to include:

```yaml
      IDENTITY_SERVICE_GRPC_URL: identity-service:${IDENTITY_SERVICE_GRPC_PORT}
      IDENTITY_SESSION_COOKIE_NAME: ${IDENTITY_SESSION_COOKIE_NAME}
      SESSION_COOKIE_SECURE: ${SESSION_COOKIE_SECURE}
```

Modify `api-gateway.depends_on` to include identity:

```yaml
    depends_on:
      - identity-service
      - photo-service
```

- [ ] **Step 6: Add migration command**

Modify `Makefile` to add `migrate-identity` to `.PHONY` and add this target:

```makefile
migrate-identity:
	docker compose -f infra/docker/docker-compose.yml --env-file .env exec -T postgres psql "$${IDENTITY_DATABASE_URL}" < apps/identity-service/migrations/0001_create_identity_tables.sql
```

- [ ] **Step 7: Verify proto generation and config parse**

Run:

```bash
pnpm proto && docker compose -f infra/docker/docker-compose.yml --env-file .env.example config >/tmp/photoops-compose-config.yml
```

Expected: exit `0`.

- [ ] **Step 8: Commit identity runtime frame**

Run:

```bash
git add proto packages/proto-ts .env.example infra/postgres/init/001-create-databases.sql infra/docker/docker-compose.yml Makefile
git commit -m "chore: add identity service frame"
```

## Task 2: Identity Service Domain And Tests

**Files:**

- Create: `apps/identity-service/package.json`
- Create: `apps/identity-service/tsconfig.json`
- Create: `apps/identity-service/nest-cli.json`
- Create: `apps/identity-service/migrations/0001_create_identity_tables.sql`
- Create: `apps/identity-service/src/db/schema.ts`
- Create: `apps/identity-service/src/identity/identity.types.ts`
- Create: `apps/identity-service/src/identity/identity.service.spec.ts`
- Create: `apps/identity-service/src/identity/identity.service.ts`

- [ ] **Step 1: Create identity package files**

Create `apps/identity-service/package.json`:

```json
{
  "name": "@photoops/identity-service",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "test": "vitest run",
    "lint": "eslint src --ext .ts"
  },
  "dependencies": {
    "@grpc/grpc-js": "^1.12.6",
    "@nestjs/common": "^10.4.15",
    "@nestjs/core": "^10.4.15",
    "@nestjs/microservices": "^10.4.15",
    "argon2": "^0.41.1",
    "drizzle-orm": "^0.38.4",
    "pg": "^8.13.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "uuidv7": "^1.0.2"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.8",
    "@types/node": "^22.10.5",
    "@types/pg": "^8.11.10",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

Create `apps/identity-service/tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2022",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

Create `apps/identity-service/nest-cli.json`:

```json
{
  "collection": "@nestjs/schematics",
  "sourceRoot": "src"
}
```

- [ ] **Step 2: Create identity migration and schema**

Create `apps/identity-service/migrations/0001_create_identity_tables.sql`:

```sql
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);
```

Create `apps/identity-service/src/db/schema.ts`:

```ts
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const passwordCredentials = pgTable('password_credentials', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true })
  },
  (table) => ({
    userIdIdx: index('sessions_user_id_idx').on(table.userId),
    expiresAtIdx: index('sessions_expires_at_idx').on(table.expiresAt)
  })
);
```

- [ ] **Step 3: Create identity domain types**

Create `apps/identity-service/src/identity/identity.types.ts`:

```ts
export type UserStatus = 'active' | 'disabled';

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface AuthSessionRecord {
  session: SessionRecord;
  user: UserRecord;
}

export interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}
```

- [ ] **Step 4: Write failing identity domain tests**

Create `apps/identity-service/src/identity/identity.service.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { IdentityDomainService } from './identity.service';

function createService(now = new Date('2026-06-22T00:00:00.000Z')) {
  const repository = {
    createUserWithPassword: vi.fn(),
    findUserByEmail: vi.fn(),
    findPasswordHash: vi.fn(),
    createSession: vi.fn(),
    findSessionWithUser: vi.fn(),
    revokeSession: vi.fn()
  };
  const passwords = {
    hash: vi.fn(async (password: string) => `hash:${password}`),
    verify: vi.fn(async (hash: string, password: string) => hash === `hash:${password}`)
  };
  return { service: new IdentityDomainService(repository, passwords, () => now), repository, passwords };
}

describe('IdentityDomainService', () => {
  it('normalizes email during signup and creates a session', async () => {
    const { service, repository } = createService();
    repository.findUserByEmail.mockResolvedValue(null);
    repository.createUserWithPassword.mockResolvedValue({ id: 'user-1', email: 'person@example.com', displayName: 'Person', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    repository.createSession.mockResolvedValue({ id: 'session-1', userId: 'user-1', expiresAt: new Date('2026-07-06T00:00:00.000Z'), createdAt: new Date(), revokedAt: null });

    const result = await service.signUp({ email: ' Person@Example.COM ', password: 'secret123', displayName: 'Person' });

    expect(repository.findUserByEmail).toHaveBeenCalledWith('person@example.com');
    expect(repository.createUserWithPassword).toHaveBeenCalledWith({ email: 'person@example.com', passwordHash: 'hash:secret123', displayName: 'Person' });
    expect(result.session.id).toBe('session-1');
  });

  it('rejects duplicate signup email', async () => {
    const { service, repository } = createService();
    repository.findUserByEmail.mockResolvedValue({ id: 'user-1' });

    await expect(service.signUp({ email: 'person@example.com', password: 'secret123', displayName: 'Person' })).rejects.toThrow('email already exists');
  });

  it('rejects invalid login credentials without revealing which field failed', async () => {
    const { service, repository } = createService();
    repository.findUserByEmail.mockResolvedValue(null);

    await expect(service.login({ email: 'missing@example.com', password: 'secret123' })).rejects.toThrow('invalid credentials');
  });

  it('rejects disabled user login', async () => {
    const { service, repository } = createService();
    repository.findUserByEmail.mockResolvedValue({ id: 'user-1', email: 'person@example.com', displayName: 'Person', status: 'disabled', createdAt: new Date(), updatedAt: new Date() });

    await expect(service.login({ email: 'person@example.com', password: 'secret123' })).rejects.toThrow('user disabled');
  });

  it('rejects expired sessions', async () => {
    const { service, repository } = createService(new Date('2026-06-22T00:00:00.000Z'));
    repository.findSessionWithUser.mockResolvedValue({
      session: { id: 'session-1', userId: 'user-1', expiresAt: new Date('2026-06-21T00:00:00.000Z'), createdAt: new Date(), revokedAt: null },
      user: { id: 'user-1', email: 'person@example.com', displayName: 'Person', status: 'active', createdAt: new Date(), updatedAt: new Date() }
    });

    await expect(service.validateSession('session-1')).rejects.toThrow('invalid session');
  });

  it('rejects revoked sessions', async () => {
    const { service, repository } = createService();
    repository.findSessionWithUser.mockResolvedValue({
      session: { id: 'session-1', userId: 'user-1', expiresAt: new Date('2026-07-01T00:00:00.000Z'), createdAt: new Date(), revokedAt: new Date() },
      user: { id: 'user-1', email: 'person@example.com', displayName: 'Person', status: 'active', createdAt: new Date(), updatedAt: new Date() }
    });

    await expect(service.validateSession('session-1')).rejects.toThrow('invalid session');
  });
});
```

- [ ] **Step 5: Run tests and verify failure**

Run:

```bash
pnpm --filter @photoops/identity-service test
```

Expected: FAIL because `./identity.service` does not exist.

- [ ] **Step 6: Implement minimal identity domain service**

Create `apps/identity-service/src/identity/identity.service.ts`:

```ts
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
```

- [ ] **Step 7: Run identity tests and commit**

Run:

```bash
pnpm --filter @photoops/identity-service test
```

Expected: PASS.

Commit:

```bash
git add apps/identity-service
git commit -m "test: define identity domain behavior"
```

## Task 3: Identity Service Persistence And gRPC Server

**Files:**

- Create: `apps/identity-service/src/db/client.ts`
- Create: `apps/identity-service/src/identity/password.service.ts`
- Create: `apps/identity-service/src/identity/identity.repository.ts`
- Create: `apps/identity-service/src/identity/identity.grpc.controller.ts`
- Create: `apps/identity-service/src/health/health.controller.ts`
- Create: `apps/identity-service/src/app.module.ts`
- Create: `apps/identity-service/src/main.ts`
- Create: `apps/identity-service/Dockerfile`

- [ ] **Step 1: Add DB client**

Create `apps/identity-service/src/db/client.ts`:

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export function createDb() {
  const connectionString = process.env.IDENTITY_DATABASE_URL;
  if (!connectionString) {
    throw new Error('IDENTITY_DATABASE_URL is required');
  }
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}
```

- [ ] **Step 2: Add password service**

Create `apps/identity-service/src/identity/password.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PasswordServicePort } from './identity.service';

@Injectable()
export class PasswordService implements PasswordServicePort {
  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }
}
```

- [ ] **Step 3: Add repository**

Create `apps/identity-service/src/identity/identity.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { createDb } from '../db/client';
import { passwordCredentials, sessions, users } from '../db/schema';
import { AuthSessionRecord, SessionRecord, UserRecord } from './identity.types';
import { IdentityRepositoryPort } from './identity.service';

@Injectable()
export class IdentityRepository implements IdentityRepositoryPort {
  private readonly db = createDb();

  async createUserWithPassword(input: { email: string; passwordHash: string; displayName: string }): Promise<UserRecord> {
    const id = uuidv7();
    const [created] = await this.db.insert(users).values({ id, email: input.email, displayName: input.displayName, status: 'active' }).returning();
    await this.db.insert(passwordCredentials).values({ userId: id, passwordHash: input.passwordHash });
    return this.toUser(created);
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
```

- [ ] **Step 4: Add gRPC and Nest bootstrap**

Create `apps/identity-service/src/identity/identity.grpc.controller.ts`:

```ts
import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
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
    return this.mapAuth(await this.identity.signUp({ email: request.email, password: request.password, displayName: request.displayName }));
  }

  @GrpcMethod('IdentityService', 'Login')
  async login(request: { email: string; password: string }) {
    return this.mapAuth(await this.identity.login({ email: request.email, password: request.password }));
  }

  @GrpcMethod('IdentityService', 'ValidateSession')
  async validateSession(request: { sessionId: string }) {
    return this.mapAuth(await this.identity.validateSession(request.sessionId));
  }

  @GrpcMethod('IdentityService', 'Logout')
  async logout(request: { sessionId: string }) {
    await this.identity.logout(request.sessionId);
    return {};
  }

  @GrpcMethod('IdentityService', 'GetCurrentUser')
  async getCurrentUser(request: { sessionId: string }) {
    const auth = await this.identity.validateSession(request.sessionId);
    return this.mapUser(auth.user);
  }

  private mapAuth(auth: AuthSessionRecord) {
    return { sessionId: auth.session.id, userId: auth.user.id, email: auth.user.email, displayName: auth.user.displayName, expiresAt: auth.session.expiresAt.toISOString() };
  }

  private mapUser(user: UserRecord) {
    const statusMap = { active: 1, disabled: 2 } as const;
    return { id: user.id, email: user.email, displayName: user.displayName, status: statusMap[user.status], createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString() };
  }
}
```

Create `apps/identity-service/src/health/health.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return { status: 'ok', service: 'identity-service' };
  }
}
```

Create `apps/identity-service/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { IdentityGrpcController } from './identity/identity.grpc.controller';
import { IdentityRepository } from './identity/identity.repository';
import { IdentityDomainService } from './identity/identity.service';
import { PasswordService } from './identity/password.service';

@Module({
  controllers: [HealthController, IdentityGrpcController],
  providers: [
    IdentityRepository,
    PasswordService,
    {
      provide: IdentityDomainService,
      useFactory: (repository: IdentityRepository, passwords: PasswordService) => new IdentityDomainService(repository, passwords),
      inject: [IdentityRepository, PasswordService]
    }
  ]
})
export class AppModule {}
```

Create `apps/identity-service/src/main.ts`:

```ts
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'photoops.identity.v1',
      protoPath: join(process.cwd(), '../../proto/identity/v1/identity_service.proto'),
      loader: { includeDirs: [join(process.cwd(), '../../proto')] },
      url: `0.0.0.0:${process.env.IDENTITY_SERVICE_GRPC_PORT ?? '50055'}`
    }
  });
  await app.startAllMicroservices();
  await app.listen(process.env.IDENTITY_SERVICE_HTTP_PORT ?? 3005);
}

void bootstrap();
```

- [ ] **Step 5: Add Dockerfile**

Create `apps/identity-service/Dockerfile`:

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/identity-service/package.json apps/identity-service/package.json
COPY packages/proto-ts/package.json packages/proto-ts/package.json
RUN pnpm install --filter @photoops/identity-service... --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/identity-service/node_modules ./apps/identity-service/node_modules
COPY . .
RUN pnpm --filter @photoops/identity-service build

FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/identity-service ./apps/identity-service
COPY --from=build /repo/proto ./proto
WORKDIR /repo/apps/identity-service
CMD ["node", "dist/main.js"]
```

- [ ] **Step 6: Verify identity service tests and build**

Run:

```bash
pnpm install && pnpm --filter @photoops/identity-service test && pnpm --filter @photoops/identity-service build
```

Expected: exit `0`.

- [ ] **Step 7: Commit identity service**

Run:

```bash
git add apps/identity-service pnpm-lock.yaml
git commit -m "feat: implement identity service"
```

## Task 4: API Gateway Auth Facade And Cookie Sessions

**Files:**

- Modify: `apps/api-gateway/package.json`
- Create: `apps/api-gateway/src/grpc/identity.client.ts`
- Create: `apps/api-gateway/src/auth/session-cookie.ts`
- Create: `apps/api-gateway/src/auth/auth.service.ts`
- Create: `apps/api-gateway/src/http/auth.controller.ts`
- Create: `apps/api-gateway/src/http/auth.controller.spec.ts`
- Modify: `apps/api-gateway/src/app.module.ts`

- [ ] **Step 1: Add cookie dependency**

Modify `apps/api-gateway/package.json` dependencies to include:

```json
"cookie": "^1.0.2"
```

Modify devDependencies to include:

```json
"@types/cookie": "^0.6.0"
```

- [ ] **Step 2: Add identity gRPC client**

Create `apps/api-gateway/src/grpc/identity.client.ts`:

```ts
import { ChannelCredentials, credentials, loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { Injectable } from '@nestjs/common';
import { join } from 'node:path';

export interface AuthSessionDto {
  sessionId: string;
  userId: string;
  email: string;
  displayName: string;
  expiresAt: string;
}

export interface IdentityGatewayClient {
  signUp(input: { email: string; password: string; displayName: string }): Promise<AuthSessionDto>;
  login(input: { email: string; password: string }): Promise<AuthSessionDto>;
  validateSession(input: { sessionId: string }): Promise<AuthSessionDto>;
  logout(input: { sessionId: string }): Promise<unknown>;
  getCurrentUser(input: { sessionId: string }): Promise<unknown>;
}

type Callback<T> = (error: Error | null, value: T) => void;

interface GrpcIdentityServiceClient {
  SignUp(input: { email: string; password: string; displayName: string }, callback: Callback<AuthSessionDto>): void;
  Login(input: { email: string; password: string }, callback: Callback<AuthSessionDto>): void;
  ValidateSession(input: { sessionId: string }, callback: Callback<AuthSessionDto>): void;
  Logout(input: { sessionId: string }, callback: Callback<unknown>): void;
  GetCurrentUser(input: { sessionId: string }, callback: Callback<unknown>): void;
}

@Injectable()
export class IdentityClient implements IdentityGatewayClient {
  private readonly client: GrpcIdentityServiceClient;

  constructor() {
    const protoPath = join(process.cwd(), '../../proto/identity/v1/identity_service.proto');
    const packageDefinition = loadSync(protoPath, { keepCase: false, longs: String, enums: Number, defaults: true, oneofs: true, includeDirs: [join(process.cwd(), '../../proto')] });
    const loaded = loadPackageDefinition(packageDefinition) as unknown as {
      photoops: { identity: { v1: { IdentityService: new (target: string, channelCredentials: ChannelCredentials) => GrpcIdentityServiceClient } } };
    };
    const target = process.env.IDENTITY_SERVICE_GRPC_URL ?? 'identity-service:50055';
    this.client = new loaded.photoops.identity.v1.IdentityService(target, credentials.createInsecure());
  }

  signUp(input: { email: string; password: string; displayName: string }) {
    return this.call((callback) => this.client.SignUp(input, callback));
  }

  login(input: { email: string; password: string }) {
    return this.call((callback) => this.client.Login(input, callback));
  }

  validateSession(input: { sessionId: string }) {
    return this.call((callback) => this.client.ValidateSession(input, callback));
  }

  logout(input: { sessionId: string }) {
    return this.call((callback) => this.client.Logout(input, callback));
  }

  getCurrentUser(input: { sessionId: string }) {
    return this.call((callback) => this.client.GetCurrentUser(input, callback));
  }

  private call<T>(invoke: (callback: Callback<T>) => void): Promise<T> {
    return new Promise((resolve, reject) => invoke((error, value) => (error ? reject(error) : resolve(value))));
  }
}
```

- [ ] **Step 3: Add cookie and auth helpers**

Create `apps/api-gateway/src/auth/session-cookie.ts`:

```ts
import { serialize } from 'cookie';

export const SESSION_COOKIE_NAME = process.env.IDENTITY_SESSION_COOKIE_NAME ?? 'photoops_session';

export function serializeSessionCookie(sessionId: string, expires: Date) {
  return serialize(SESSION_COOKIE_NAME, sessionId, { httpOnly: true, sameSite: 'lax', secure: process.env.SESSION_COOKIE_SECURE === 'true', path: '/', expires });
}

export function serializeClearedSessionCookie() {
  return serialize(SESSION_COOKIE_NAME, '', { httpOnly: true, sameSite: 'lax', secure: process.env.SESSION_COOKIE_SECURE === 'true', path: '/', expires: new Date(0) });
}
```

Create `apps/api-gateway/src/auth/auth.service.ts`:

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { parse } from 'cookie';
import { IdentityClient, AuthSessionDto } from '../grpc/identity.client';
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
```

- [ ] **Step 4: Add auth controller tests**

Create `apps/api-gateway/src/http/auth.controller.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller';

function createController() {
  const identityClient = { signUp: vi.fn(), login: vi.fn(), logout: vi.fn(), getCurrentUser: vi.fn() };
  const authService = { readSessionId: vi.fn(), requireSession: vi.fn() };
  const response = { setHeader: vi.fn() };
  return { controller: new AuthController(identityClient as never, authService as never), identityClient, authService, response };
}

describe('AuthController', () => {
  it('sets a session cookie after signup', async () => {
    const { controller, identityClient, response } = createController();
    identityClient.signUp.mockResolvedValue({ sessionId: 'session-1', userId: 'user-1', email: 'person@example.com', displayName: 'Person', expiresAt: '2026-07-06T00:00:00.000Z' });

    await expect(controller.signUp({ email: 'person@example.com', password: 'secret123', displayName: 'Person' }, response as never)).resolves.toEqual({ userId: 'user-1', email: 'person@example.com', displayName: 'Person' });
    expect(response.setHeader).toHaveBeenCalledWith('set-cookie', expect.stringContaining('photoops_session=session-1'));
  });

  it('clears a session cookie after logout', async () => {
    const { controller, identityClient, authService, response } = createController();
    authService.readSessionId.mockReturnValue('session-1');
    identityClient.logout.mockResolvedValue({});

    await expect(controller.logout('photoops_session=session-1', response as never)).resolves.toEqual({ ok: true });
    expect(identityClient.logout).toHaveBeenCalledWith({ sessionId: 'session-1' });
    expect(response.setHeader).toHaveBeenCalledWith('set-cookie', expect.stringContaining('Expires=Thu, 01 Jan 1970'));
  });
});
```

- [ ] **Step 5: Run tests and verify failure**

Run:

```bash
pnpm --filter @photoops/api-gateway test
```

Expected: FAIL because `auth.controller.ts` does not exist.

- [ ] **Step 6: Add auth controller and module wiring**

Create `apps/api-gateway/src/http/auth.controller.ts`:

```ts
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
```

Modify `apps/api-gateway/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthService } from './auth/auth.service';
import { IdentityClient } from './grpc/identity.client';
import { PhotoClient } from './grpc/photo.client';
import { AuthController } from './http/auth.controller';
import { HealthController } from './http/health.controller';
import { PhotoController } from './http/photo.controller';

@Module({
  controllers: [HealthController, AuthController, PhotoController],
  providers: [IdentityClient, AuthService, PhotoClient]
})
export class AppModule {}
```

- [ ] **Step 7: Verify gateway tests and build**

Run:

```bash
pnpm install && pnpm --filter @photoops/api-gateway test && pnpm --filter @photoops/api-gateway build
```

Expected: exit `0`.

- [ ] **Step 8: Commit gateway auth facade**

Run:

```bash
git add apps/api-gateway pnpm-lock.yaml
git commit -m "feat: add gateway auth facade"
```

## Task 5: Photo Service User Ownership

**Files:**

- Modify: `proto/photo/v1/photo_service.proto`
- Modify: `apps/photo-service/migrations/0001_create_photo_assets.sql`
- Modify: `apps/photo-service/src/db/schema.ts`
- Modify: `apps/photo-service/src/photo/photo.types.ts`
- Modify: `apps/photo-service/src/photo/photo.service.spec.ts`
- Modify: `apps/photo-service/src/photo/photo.service.ts`
- Modify: `apps/photo-service/src/photo/photo.repository.ts`
- Modify: `apps/photo-service/src/photo/photo.grpc.controller.ts`

- [ ] **Step 1: Add user_id to photo proto**

Modify `proto/photo/v1/photo_service.proto`:

```proto
message CreateUploadIntentRequest {
  string filename = 1;
  string content_type = 2;
  string size_bytes = 3;
  string user_id = 4;
}

message CompleteUploadRequest {
  string photo_id = 1;
  string user_id = 2;
}

message ListPhotosRequest {
  int32 page_size = 1;
  string page_token = 2;
  string user_id = 3;
}

message PhotoAsset {
  string id = 1;
  string filename = 2;
  string content_type = 3;
  string size_bytes = 4;
  string object_key = 5;
  PhotoStatus status = 6;
  string created_at = 7;
  string updated_at = 8;
  string user_id = 9;
}
```

Run:

```bash
pnpm proto
```

Expected: exit `0`.

- [ ] **Step 2: Add user_id to photo schema**

Modify `apps/photo-service/migrations/0001_create_photo_assets.sql`:

```sql
CREATE TABLE IF NOT EXISTS photo_assets (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL,
  object_key text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('uploading', 'uploaded', 'processing', 'ready', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS photo_assets_user_created_at_idx ON photo_assets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS photo_assets_status_idx ON photo_assets (status);
```

Modify `apps/photo-service/src/db/schema.ts` to include `userId`:

```ts
userId: uuid('user_id').notNull(),
```

Replace the created-at index with:

```ts
userCreatedAtIdx: index('photo_assets_user_created_at_idx').on(table.userId, table.createdAt),
```

- [ ] **Step 3: Update photo types**

Modify `apps/photo-service/src/photo/photo.types.ts`:

```ts
export type PhotoStatus = 'uploading' | 'uploaded' | 'processing' | 'ready' | 'failed';

export interface PhotoAssetRecord {
  id: string;
  userId: string;
  filename: string;
  contentType: string;
  sizeBytes: bigint;
  objectKey: string;
  status: PhotoStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUploadIntentInput {
  userId: string;
  filename: string;
  contentType: string;
  sizeBytes: bigint;
}
```

- [ ] **Step 4: Update failing photo ownership tests**

Modify `apps/photo-service/src/photo/photo.service.spec.ts` so repository mocks are user-scoped and add these tests:

```ts
it('lists only photos for the provided user id', async () => {
  const { service, repository } = createService();
  repository.list.mockResolvedValue([]);

  await service.listPhotos('user-1');

  expect(repository.list).toHaveBeenCalledWith('user-1', 100);
});

it('completes upload only for the owning user', async () => {
  const { service, repository, storage } = createService();
  repository.findByIdForUser.mockResolvedValue({
    id: 'photo-1',
    userId: 'user-1',
    filename: 'photo.jpg',
    contentType: 'image/jpeg',
    sizeBytes: 123n,
    objectKey: 'originals/photo-1/photo.jpg',
    status: 'uploading',
    createdAt: new Date(),
    updatedAt: new Date()
  });
  repository.markUploadedForUser.mockResolvedValue({
    id: 'photo-1',
    userId: 'user-1',
    filename: 'photo.jpg',
    contentType: 'image/jpeg',
    sizeBytes: 123n,
    objectKey: 'originals/photo-1/photo.jpg',
    status: 'uploaded',
    createdAt: new Date(),
    updatedAt: new Date()
  });
  storage.objectExists.mockResolvedValue(true);

  await service.completeUpload('user-1', 'photo-1');

  expect(repository.findByIdForUser).toHaveBeenCalledWith('user-1', 'photo-1');
  expect(repository.markUploadedForUser).toHaveBeenCalledWith('user-1', 'photo-1');
});
```

Update existing calls to pass `userId`, for example:

```ts
await service.createUploadIntent({ userId: 'user-1', filename: 'photo.jpg', contentType: 'image/jpeg', sizeBytes: 123n });
await expect(service.completeUpload('user-1', 'photo-1')).rejects.toThrow('uploaded object not found');
```

- [ ] **Step 5: Run photo tests and verify failure**

Run:

```bash
pnpm --filter @photoops/photo-service test
```

Expected: FAIL because service/repository signatures are not updated.

- [ ] **Step 6: Update photo service interfaces and logic**

Modify `apps/photo-service/src/photo/photo.service.ts` interface methods:

```ts
export interface PhotoRepositoryPort {
  createUploading(input: CreateUploadIntentInput): Promise<PhotoAssetRecord>;
  markUploadedForUser(userId: string, photoId: string): Promise<PhotoAssetRecord>;
  findByIdForUser(userId: string, photoId: string): Promise<PhotoAssetRecord | null>;
  list(userId: string, limit: number): Promise<PhotoAssetRecord[]>;
}
```

Modify methods:

```ts
async completeUpload(userId: string, photoId: string) {
  const photo = await this.repository.findByIdForUser(userId, photoId);
  if (!photo) {
    throw new Error('photo not found');
  }
  const objectExists = await this.storage.objectExists(photo.objectKey);
  if (!objectExists) {
    throw new Error('uploaded object not found');
  }
  return this.repository.markUploadedForUser(userId, photoId);
}

async listPhotos(userId: string, limit = 100) {
  return this.repository.list(userId, limit);
}
```

- [ ] **Step 7: Update photo repository**

Modify `apps/photo-service/src/photo/photo.repository.ts` imports:

```ts
import { and, desc, eq } from 'drizzle-orm';
```

In `createUploading`, insert `userId: input.userId`.

Replace `markUploaded`, `findById`, and `list` with:

```ts
async markUploadedForUser(userId: string, photoId: string): Promise<PhotoAssetRecord> {
  const [updated] = await this.db
    .update(photoAssets)
    .set({ status: 'uploaded', updatedAt: new Date() })
    .where(and(eq(photoAssets.id, photoId), eq(photoAssets.userId, userId)))
    .returning();
  if (!updated) {
    throw new Error('photo not found');
  }
  return this.toRecord(updated);
}

async findByIdForUser(userId: string, photoId: string): Promise<PhotoAssetRecord | null> {
  const [row] = await this.db.select().from(photoAssets).where(and(eq(photoAssets.id, photoId), eq(photoAssets.userId, userId))).limit(1);
  return row ? this.toRecord(row) : null;
}

async list(userId: string, limit: number): Promise<PhotoAssetRecord[]> {
  const rows = await this.db.select().from(photoAssets).where(eq(photoAssets.userId, userId)).orderBy(desc(photoAssets.createdAt)).limit(limit);
  return rows.map((row) => this.toRecord(row));
}
```

Add `userId: row.userId` to `toRecord`.

- [ ] **Step 8: Update photo gRPC controller**

Modify request signatures and service calls in `apps/photo-service/src/photo/photo.grpc.controller.ts`:

```ts
async createUploadIntent(request: { filename: string; contentType: string; sizeBytes: string; userId: string }) {
  const result = await this.photoService.createUploadIntent({ userId: request.userId, filename: request.filename, contentType: request.contentType, sizeBytes: BigInt(request.sizeBytes) });
```

```ts
async completeUpload(request: { photoId: string; userId: string }) {
  return this.mapPhoto(await this.photoService.completeUpload(request.userId, request.photoId));
}
```

```ts
async listPhotos(request: { pageSize?: number; userId: string }) {
  const photos = await this.photoService.listPhotos(request.userId, request.pageSize || 100);
  return { photos: photos.map((photo) => this.mapPhoto(photo)), nextPageToken: '' };
}
```

Add `userId: photo.userId` to mapped photo responses.

- [ ] **Step 9: Verify photo service tests and build**

Run:

```bash
pnpm --filter @photoops/photo-service test && pnpm --filter @photoops/photo-service build
```

Expected: exit `0`.

- [ ] **Step 10: Commit photo ownership**

Run:

```bash
git add proto packages/proto-ts apps/photo-service
git commit -m "feat: scope photo assets to users"
```

## Task 6: Gateway Protected Photo Routes

**Files:**

- Modify: `apps/api-gateway/src/grpc/photo.client.ts`
- Modify: `apps/api-gateway/src/http/photo.controller.ts`
- Modify: `apps/api-gateway/src/http/photo.controller.spec.ts`

- [ ] **Step 1: Update photo client types**

Modify `apps/api-gateway/src/grpc/photo.client.ts` interface input types:

```ts
export interface PhotoGatewayClient {
  createUploadIntent(input: { userId: string; filename: string; contentType: string; sizeBytes: string }): Promise<unknown>;
  completeUpload(input: { userId: string; photoId: string }): Promise<unknown>;
  listPhotos(input: { userId: string; pageSize: number }): Promise<unknown>;
}
```

Update `GrpcPhotoServiceClient` with the same input shapes.

- [ ] **Step 2: Update photo controller tests**

Modify `apps/api-gateway/src/http/photo.controller.spec.ts` `createController` to include `authService`:

```ts
const authService = { requireSession: vi.fn().mockResolvedValue({ userId: 'user-1' }) };
return { controller: new PhotoController(photoClient, authService as never), photoClient, authService };
```

Update test calls to pass a cookie header:

```ts
await controller.createUploadIntent('photoops_session=session-1', { filename: 'photo.jpg', contentType: 'image/jpeg', sizeBytes: '123' });
await controller.completeUpload('photoops_session=session-1', 'photo-1');
await controller.listPhotos('photoops_session=session-1');
```

Assert user scoping:

```ts
expect(photoClient.createUploadIntent).toHaveBeenCalledWith({ userId: 'user-1', filename: 'photo.jpg', contentType: 'image/jpeg', sizeBytes: '123' });
expect(photoClient.completeUpload).toHaveBeenCalledWith({ userId: 'user-1', photoId: 'photo-1' });
expect(photoClient.listPhotos).toHaveBeenCalledWith({ userId: 'user-1', pageSize: 100 });
```

- [ ] **Step 3: Run gateway tests and verify failure**

Run:

```bash
pnpm --filter @photoops/api-gateway test
```

Expected: FAIL because `PhotoController` does not yet inject `AuthService`.

- [ ] **Step 4: Protect photo routes**

Modify `apps/api-gateway/src/http/photo.controller.ts`:

```ts
import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { PhotoClient } from '../grpc/photo.client';

@Controller('photos')
export class PhotoController {
  constructor(
    private readonly photoClient: PhotoClient,
    private readonly authService: AuthService
  ) {}

  @Post('upload-intents')
  async createUploadIntent(@Headers('cookie') cookieHeader: string | undefined, @Body() body: { filename: string; contentType: string; sizeBytes: string }) {
    const auth = await this.authService.requireSession(cookieHeader);
    return this.photoClient.createUploadIntent({ userId: auth.userId, ...body });
  }

  @Post(':photoId/complete-upload')
  async completeUpload(@Headers('cookie') cookieHeader: string | undefined, @Param('photoId') photoId: string) {
    const auth = await this.authService.requireSession(cookieHeader);
    return this.mapPhoto(await this.photoClient.completeUpload({ userId: auth.userId, photoId }));
  }

  @Get()
  async listPhotos(@Headers('cookie') cookieHeader: string | undefined) {
    const auth = await this.authService.requireSession(cookieHeader);
    const response = (await this.photoClient.listPhotos({ userId: auth.userId, pageSize: 100 })) as { photos?: unknown[] };
    return { ...response, photos: (response.photos ?? []).map((photo) => this.mapPhoto(photo)) };
  }

  private mapPhoto(photo: unknown) {
    if (!photo || typeof photo !== 'object') {
      return photo;
    }
    const statusMap: Record<string, string> = {
      '1': 'uploading',
      '2': 'uploaded',
      '3': 'processing',
      '4': 'ready',
      '5': 'failed',
      PHOTO_STATUS_UPLOADING: 'uploading',
      PHOTO_STATUS_UPLOADED: 'uploaded',
      PHOTO_STATUS_PROCESSING: 'processing',
      PHOTO_STATUS_READY: 'ready',
      PHOTO_STATUS_FAILED: 'failed'
    };
    const asset = photo as { status?: unknown };
    const status = statusMap[String(asset.status)] ?? asset.status;
    return { ...asset, status };
  }
}
```

- [ ] **Step 5: Verify gateway tests and build**

Run:

```bash
pnpm --filter @photoops/api-gateway test && pnpm --filter @photoops/api-gateway build
```

Expected: exit `0`.

- [ ] **Step 6: Commit protected photo routes**

Run:

```bash
git add apps/api-gateway
git commit -m "feat: protect photo routes with sessions"
```

## Task 7: Web Auth UI And Credentialed API Calls

**Files:**

- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: Update web API helper**

Modify all gateway `fetch` calls in `apps/web/lib/api.ts` to include credentials:

```ts
credentials: 'include'
```

Add auth helper types/functions:

```ts
export interface CurrentUser {
  userId: string;
  email: string;
  displayName: string;
}

export async function signUp(input: { email: string; password: string; displayName: string }) {
  const response = await fetch(`${API_BASE_URL}/auth/signup`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  if (!response.ok) {
    throw new Error(`SignUp failed: ${response.status}`);
  }
  return response.json() as Promise<CurrentUser>;
}

export async function login(input: { email: string; password: string }) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  if (!response.ok) {
    throw new Error(`Login failed: ${response.status}`);
  }
  return response.json() as Promise<CurrentUser>;
}

export async function logout() {
  const response = await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Logout failed: ${response.status}`);
  }
}

export async function getCurrentUser() {
  const response = await fetch(`${API_BASE_URL}/auth/me`, { credentials: 'include', cache: 'no-store' });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`GetCurrentUser failed: ${response.status}`);
  }
  return response.json() as Promise<CurrentUser>;
}
```

- [ ] **Step 2: Update page UI**

Modify `apps/web/app/page.tsx` so it keeps `currentUser` state, shows signup/login forms when signed out, and shows upload/list only when signed in.

Use this component shape:

```tsx
const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
```

On load:

```tsx
useEffect(() => {
  void getCurrentUser()
    .then((user) => {
      setCurrentUser(user);
      if (user) {
        void refreshPhotos();
      }
    })
    .catch((error) => setMessage(error instanceof Error ? error.message : 'Failed to load session'));
}, []);
```

Add form handlers:

```tsx
async function onSignup(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const form = event.currentTarget;
  const email = (form.elements.namedItem('email') as HTMLInputElement).value;
  const password = (form.elements.namedItem('password') as HTMLInputElement).value;
  const displayName = (form.elements.namedItem('displayName') as HTMLInputElement).value;
  const user = await signUp({ email, password, displayName });
  setCurrentUser(user);
  await refreshPhotos();
  form.reset();
}

async function onLogin(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const form = event.currentTarget;
  const email = (form.elements.namedItem('email') as HTMLInputElement).value;
  const password = (form.elements.namedItem('password') as HTMLInputElement).value;
  const user = await login({ email, password });
  setCurrentUser(user);
  await refreshPhotos();
  form.reset();
}

async function onLogout() {
  await logout();
  setCurrentUser(null);
  setPhotos([]);
}
```

Render signed-out forms before upload controls. Keep the existing upload/list UI, but only render it when `currentUser` is not null.

- [ ] **Step 3: Verify web build**

Run:

```bash
pnpm --filter @photoops/web build
```

Expected: exit `0`.

- [ ] **Step 4: Commit web auth UI**

Run:

```bash
git add apps/web
git commit -m "feat: add web auth flow"
```

## Task 8: Smoke Test, Verification Docs, And Final Quality Gates

**Files:**

- Create: `scripts/smoke-auth-upload-ownership.sh`
- Modify: `scripts/smoke-upload.sh`
- Modify: `package.json`
- Modify: `docs/architecture-frame-verification.md`
- Modify: `README.md` if quickstart commands change

- [ ] **Step 1: Add authenticated smoke test**

Create `scripts/smoke-auth-upload-ownership.sh`:

```sh
#!/usr/bin/env sh
set -eu

API_BASE_URL="${API_BASE_URL:-http://localhost:3001}"
TMP_DIR="${TMPDIR:-/tmp}/photoops-auth-smoke"
COOKIE_A="$TMP_DIR/user-a.cookie"
COOKIE_B="$TMP_DIR/user-b.cookie"
JPEG_PATH="$TMP_DIR/smoke.jpg"
INTENT_PATH="$TMP_DIR/intent.json"
LIST_A_PATH="$TMP_DIR/list-a.json"
LIST_B_PATH="$TMP_DIR/list-b.json"
COMPLETE_B_PATH="$TMP_DIR/complete-b.json"
STAMP="$(date +%s)"

mkdir -p "$TMP_DIR"

python3 - <<'PY' "$JPEG_PATH"
from pathlib import Path
import base64
import sys

Path(sys.argv[1]).write_bytes(base64.b64decode(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z"
))
PY

curl -fsS -c "$COOKIE_A" -H 'content-type: application/json' -d "{\"email\":\"user-a-$STAMP@example.com\",\"password\":\"secret123\",\"displayName\":\"User A\"}" "$API_BASE_URL/auth/signup" >/dev/null

curl -fsS -b "$COOKIE_A" -H 'content-type: application/json' -d "{\"filename\":\"smoke.jpg\",\"contentType\":\"image/jpeg\",\"sizeBytes\":\"$(wc -c < "$JPEG_PATH" | tr -d ' ')\"}" "$API_BASE_URL/photos/upload-intents" > "$INTENT_PATH"

PHOTO_ID="$(python3 - <<'PY' "$INTENT_PATH"
import json, sys
print(json.load(open(sys.argv[1]))["photoId"])
PY
)"

UPLOAD_URL="$(python3 - <<'PY' "$INTENT_PATH"
import json, sys
print(json.load(open(sys.argv[1]))["uploadUrl"])
PY
)"

curl -fsS -X PUT -H 'content-type: image/jpeg' --data-binary "@$JPEG_PATH" "$UPLOAD_URL" >/dev/null
curl -fsS -b "$COOKIE_A" -X POST "$API_BASE_URL/photos/$PHOTO_ID/complete-upload" >/dev/null
curl -fsS -b "$COOKIE_A" "$API_BASE_URL/photos" > "$LIST_A_PATH"

curl -fsS -c "$COOKIE_B" -H 'content-type: application/json' -d "{\"email\":\"user-b-$STAMP@example.com\",\"password\":\"secret123\",\"displayName\":\"User B\"}" "$API_BASE_URL/auth/signup" >/dev/null
curl -fsS -b "$COOKIE_B" "$API_BASE_URL/photos" > "$LIST_B_PATH"

STATUS_B="$(curl -sS -o "$COMPLETE_B_PATH" -w '%{http_code}' -b "$COOKIE_B" -X POST "$API_BASE_URL/photos/$PHOTO_ID/complete-upload")"

python3 - <<'PY' "$PHOTO_ID" "$LIST_A_PATH" "$LIST_B_PATH" "$STATUS_B"
import json, sys
photo_id, list_a_path, list_b_path, status_b = sys.argv[1:]
photos_a = json.load(open(list_a_path)).get("photos", [])
photos_b = json.load(open(list_b_path)).get("photos", [])
if not any(photo.get("id") == photo_id and str(photo.get("status")).lower().endswith("uploaded") for photo in photos_a):
    raise SystemExit("user A uploaded photo not found")
if any(photo.get("id") == photo_id for photo in photos_b):
    raise SystemExit("user B can list user A photo")
if status_b not in {"404", "500"}:
    raise SystemExit(f"unexpected cross-user complete status {status_b}")
print("auth upload ownership smoke ok")
PY
```

Run:

```bash
chmod +x scripts/smoke-auth-upload-ownership.sh
```

- [ ] **Step 2: Update package smoke tests**

Modify root `package.json` test script:

```json
"test": "sh scripts/test-smoke-upload-contract.sh && pnpm --filter './apps/*' --if-present test"
```

Keep unit tests separate from runtime smoke. Do not run HTTP smoke from `pnpm test`; HTTP smoke requires compose services.

- [ ] **Step 3: Update verification docs**

Modify `docs/architecture-frame-verification.md` command block:

```bash
cp .env.example .env
make install
make proto
docker compose -f infra/docker/docker-compose.yml --env-file .env build
make dev
make migrate-identity
make migrate-photo
scripts/smoke-auth-upload-ownership.sh
```

Update manual check:

```markdown
1. Open `http://localhost:3000`.
2. Sign up with an e-mail, password, and display name.
3. Upload a JPEG smaller than 25 MB.
4. Confirm the file appears in the uploaded photos list with status `uploaded`.
5. Log out and sign up as a second user.
6. Confirm the second user's photo list does not show the first user's photo.
```

- [ ] **Step 4: Run full local quality gates**

Run:

```bash
pnpm proto && pnpm test && pnpm build
```

Expected: exit `0`.

- [ ] **Step 5: Run compose smoke verification**

Run:

```bash
cp .env.example .env
docker compose -f infra/docker/docker-compose.yml --env-file .env up --build -d postgres minio minio-init rabbitmq identity-service photo-service api-gateway web
make migrate-identity
make migrate-photo
scripts/smoke-auth-upload-ownership.sh
```

Expected: `auth upload ownership smoke ok`.

- [ ] **Step 6: Commit verification updates**

Run:

```bash
git add scripts package.json docs/architecture-frame-verification.md README.md
git commit -m "test: verify authenticated upload ownership"
```

## Task 9: Session Close

**Files:**

- Modify: `.beads/issues.jsonl`

- [ ] **Step 1: Inspect final status and diff**

Run:

```bash
git status --short
git diff --stat
git log --oneline -10
```

Expected: only intended committed changes exist; no unstaged source changes.

- [ ] **Step 2: Close the beads issue**

Run:

```bash
bd close <implementation-issue-id> --reason="Implemented identity-service, auth sessions, and user-scoped upload/list ownership."
```

- [ ] **Step 3: Commit beads closure if changed**

Run:

```bash
git add .beads/issues.jsonl
git commit -m "chore: close identity users task"
```

- [ ] **Step 4: Push git and beads**

Run:

```bash
git pull --rebase
bd dolt push
git push
git status --short --branch
```

Expected: final status shows branch up to date with origin.

## Self-Review Notes

Spec coverage:

- Domain model documentation was completed before this plan.
- `identity-service` ownership is covered by Tasks 1-3.
- HTTP-only cookie session flow is covered by Task 4.
- Photo ownership enforcement is covered by Tasks 5-6.
- Web signup/login/logout is covered by Task 7.
- Two-user ownership smoke verification is covered by Task 8.

Scope decisions:

- OAuth, e-mail verification, password reset, organizations, roles, and real billing are not included.
- Gateway stays database-free.
- `photo-service` receives explicit `userId` fields rather than gRPC metadata for the first implementation because it is easier to test and generated-client friendly.
