# identity-service

## Local context

- Owns users, credentials, and sessions; exposes a gRPC API consumed by api-gateway.
- Signup/login handled by `IdentityDomainService` (`src/identity/identity.service.ts`) and `IdentityRepository` (`src/identity/identity.repository.ts`); passwords are hashed with argon2id via `PasswordService` (`src/identity/password.service.ts`); user and credential rows are written in a single transaction.
- Sessions are stored in the `sessions` table in `identity-db` (Drizzle schema in `src/db/schema.ts`); `IdentityRepository.createSession` writes a new row with a 14-day TTL; lookup joins `sessions` and `users` to return an `AuthSessionRecord`; revocation sets `revoked_at`.
- Schema: `migrations/` applied via `make migrate-identity`.
- Tests: `vitest run` (`make test-identity`).

## Local invariants

- Owns and connects only to `identity-db`; no other service connects to it.
- Passwords are stored hashed, never in plaintext; sessions are server-side.
- Cross-service user references use UUID v7.
