# Identity And Domain Model Design

Date: 2026-06-22

## Context

PhotoOps currently has an executable architecture frame for JPEG upload/list:

```text
web -> api-gateway -> photo-service -> MinIO + photo-db -> web
```

The project is intended to become multi-user. Users will later connect to usage accounting and possible monetization, so user ownership must be modeled before more domain entities are implemented.

The current implementation has a real `PhotoAsset` table owned by `photo-service`, but it has no `user_id`. Other services are scaffolds or contracts only. The next design step is to document the domain model and prepare a feature branch that adds users, authentication, and per-user ownership enforcement.

## Goals

- Document the current and projected domain model outside the user feature branch.
- Add a proper `identity-service` as the owner of users and authentication state.
- Support signup and login by e-mail/password.
- Use HTTP-only browser session cookies.
- Enforce that users cannot manage objects owned by other users.
- Keep `api-gateway` database-free.
- Keep data-owning services connected only to their own databases.

## Non-Goals

- OAuth.
- E-mail verification.
- Password reset.
- Organization/team accounts.
- Roles or complex ACL.
- Real billing or payment processing.
- Production-grade account recovery and abuse prevention.

## Service Boundaries

Add `identity-service` as a new data-owning service.

`identity-service` owns:

- users;
- password credentials;
- sessions;
- signup, login, logout, and session validation.

`api-gateway` remains a database-free BFF. It reads and writes HTTP-only auth cookies, calls `identity-service` to validate sessions, and passes the authenticated `user_id` to downstream services. It must not connect to `identity-db`.

`photo-service` continues to own `PhotoAsset` and photo upload/list behavior. It stores `user_id` on photo rows and enforces user ownership in create/list/complete flows. It must not connect to `identity-db` and must not validate e-mail/password.

Future data-owning services add `user_id` to user-owned entities in their own databases. These are UUID v7 cross-service references without cross-service foreign keys.

## Domain Model Documentation

Add `docs/domain-model.md` on `main` before the feature branch implementation.

The document records:

- current implemented model;
- projected model;
- owning service per entity;
- owning database per entity;
- current implementation status;
- known statuses for entities with workflows;
- deferred ownership decisions.

Current implemented entity:

- `PhotoAsset`, owned by `photo-service`, stored in `photo-db.photo_assets`, without `user_id`.

Projected identity entities:

- `User`, `PasswordCredential`, and `Session`, owned by `identity-service` and stored in `identity-db`.

Projected user-owned entities:

- `PhotoAsset` and later `PhotoVariant` in `photo-service`;
- `PhotoCluster` and `PhotoClusterItem` in `cluster-service`;
- `Post` and `PostPhoto` in `publication-service`;
- `BillingEvent` in `usage-service`;
- connector records in `connector-service` where they represent user-owned external configuration or attempts.

Deferred decision:

- `Note` ownership is deferred until notes enter implementation. Do not introduce a `notes-service` now.

## Identity Data Model

`users`:

- `id uuid primary key`
- `email text not null unique`
- `display_name text not null`
- `status text not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

User statuses:

- `active`
- `disabled`

`password_credentials`:

- `user_id uuid primary key`
- `password_hash text not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

`sessions`:

- `id uuid primary key`
- `user_id uuid not null`
- `expires_at timestamptz not null`
- `created_at timestamptz not null`
- `revoked_at timestamptz null`

Within `identity-db`, `password_credentials.user_id` and `sessions.user_id` can use regular foreign keys to `users.id` because they are owned by the same service.

Rules:

- Normalize e-mail with trim and lowercase before uniqueness checks and storage.
- Reject duplicate normalized e-mail on signup.
- Never store raw passwords.
- Use Argon2id for password hashing unless implementation tooling requires a smaller safe adjustment.
- Reject login for disabled users.
- Reject expired or revoked sessions.

## Authentication Flow

Signup:

```text
web -> api-gateway -> identity-service -> identity-db
```

After successful signup, either create a session immediately or require login. The recommended implementation creates a session immediately to reduce first-run friction.

Login:

```text
web -> api-gateway -> identity-service -> identity-db -> api-gateway sets cookie -> web
```

Logout:

```text
web -> api-gateway -> identity-service revokes session -> api-gateway clears cookie -> web
```

Current user:

```text
web -> api-gateway -> identity-service validates session -> web
```

Cookie requirements:

- HTTP-only;
- `SameSite=Lax`;
- `Secure` outside local development;
- path `/`;
- expiry aligned with session expiry.

## Contracts

Add `proto/identity/v1/identity_service.proto`.

Minimum RPCs:

- `SignUp`
- `Login`
- `ValidateSession`
- `Logout`
- `GetCurrentUser`

Public HTTP facade in `api-gateway`:

- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

Protected photo HTTP routes:

- `POST /photos/upload-intents`
- `POST /photos/:photoId/complete-upload`
- `GET /photos`

The gateway validates the session before protected photo routes and passes `user_id` to `photo-service` through gRPC metadata or explicit request fields. Prefer the smallest implementation that is clear and testable; if explicit fields are easier with generated clients, use explicit fields for the first implementation.

## Photo Ownership Changes

Add `user_id` to `photo_assets`.

Update photo contracts and service methods so upload/list/complete operate in authenticated user scope.

Rules:

- Creating an upload intent requires `user_id`.
- New photo assets are created with the authenticated `user_id`.
- Listing photos filters by authenticated `user_id`.
- Completing upload updates only a row matching both `photo_id` and authenticated `user_id`.
- If a photo exists but belongs to another user, return the same public shape as not found. Do not reveal cross-user object existence.
- Existing object key rules remain unchanged: generated server-side, not derived as a trust boundary from raw filenames, originals private.

## Error Handling

Authentication errors:

- Missing session cookie returns `401` from `api-gateway`.
- Invalid, expired, or revoked session returns `401`.
- Duplicate e-mail on signup returns `409`.
- Invalid credentials return `401` without revealing whether the e-mail exists.
- Disabled user login returns `403` or a stable auth error mapped to `403`.

Ownership errors:

- Cross-user photo access returns not found or a generic forbidden response that does not reveal another user's object existence. Prefer not found for photo detail/complete flows.

Service failures:

- `api-gateway` maps identity and photo service failures into stable JSON errors.
- Data-owning service readiness checks verify only their own dependencies.

## Testing

Identity service unit tests:

- signup normalizes e-mail;
- duplicate e-mail is rejected;
- password verification succeeds for the correct password;
- invalid password is rejected;
- disabled user cannot log in;
- expired or revoked session is rejected.

Gateway tests:

- unauthenticated photo routes return `401`;
- valid session allows protected photo routes;
- gateway propagates authenticated `user_id` to photo calls;
- logout clears the cookie and revokes the session.

Photo service tests:

- upload intent stores `user_id`;
- list filters by `user_id`;
- complete upload only updates rows owned by `user_id`;
- another user's photo cannot be completed or listed.

Smoke test:

- sign up user A;
- upload a JPEG as user A;
- list shows user A's uploaded photo;
- sign up user B;
- user B cannot list or complete user A's photo.

## Rollout Plan Shape

The implementation plan should be written after this spec is reviewed.

Expected plan sequence:

1. Add domain model documentation on `main`.
2. Create a feature branch for identity/users.
3. Add identity proto and generated clients.
4. Add `identity-service` package, DB, migrations, and unit tests.
5. Add gateway auth facade and cookie handling.
6. Add `user_id` to photo contracts, schema, and domain logic.
7. Update web signup/login/logout and protected upload/list flow.
8. Update Docker Compose, environment contract, smoke tests, and verification docs.
