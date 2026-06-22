# E2E Scenarios: Authenticated Upload Ownership

Date: 2026-06-22

## Scope

These scenarios verify the feature branch `feat/identity-users-upload-ownership` before review. They cover the user-visible behavior added by the branch: signup/login/logout, HTTP-only session flow, authenticated photo upload/list, and cross-user ownership isolation.

The scenarios intentionally stay inside the current executable frame. They do not test EXIF extraction, previews, clustering, publication, usage accounting, connectors, OAuth, password reset, or e-mail verification.

## Setup

From the repository root:

```bash
cp .env.example .env
make install
make proto
docker compose -f infra/docker/docker-compose.yml --env-file .env up --build
```

In another terminal:

```bash
make migrate-identity
make migrate-photo
```

Open `http://localhost:3000`.

If stale local containers or volumes interfere, stop only this project's compose stack first:

```bash
docker compose -f infra/docker/docker-compose.yml --env-file .env down
```

## Automated Smoke Baseline

Run:

```bash
scripts/smoke-auth-upload-ownership.sh
```

Expected:

```text
auth upload ownership smoke ok
```

This confirms a two-user backend flow: user A uploads and lists a photo; user B cannot list or complete user A's photo.

## Scenario 1: Sign Up And Upload JPEG

Purpose: verify the primary happy path for a new user.

Steps:

1. Open `http://localhost:3000`.
2. In `Create account`, enter a display name, e-mail, and password with at least 8 characters.
3. Submit `Sign up`.
4. Confirm the UI shows the signed-in user identity.
5. Select a JPEG smaller than 25 MB.
6. Submit `Upload`.
7. Wait for the status message to reach `Upload complete`.
8. Confirm the uploaded photo appears under `Uploaded Photos` with status `uploaded`.

Expected result:

- User is signed in without manually copying a token.
- Upload completes through presigned MinIO PUT.
- The photo is listed for the signed-in user with status `uploaded`.

## Scenario 2: Logout And Login Again

Purpose: verify session lifecycle and login with existing credentials.

Steps:

1. Start from a signed-in user from Scenario 1.
2. Click `Log out`.
3. Confirm the signup/login panel is shown.
4. In `Log in`, enter the same e-mail and password.
5. Submit `Log in`.
6. Confirm the UI shows the signed-in user identity again.
7. Confirm the user's previously uploaded photo is visible in `Uploaded Photos`.

Expected result:

- Logout clears the browser session.
- Login creates a new valid session.
- The user's own photo list is restored after login.

## Scenario 3: Cross-User Photo Isolation

Purpose: verify a user cannot manage another user's photos.

Steps:

1. Complete Scenario 1 as user A and leave at least one uploaded photo visible.
2. Click `Log out`.
3. Sign up as user B with a different e-mail.
4. Confirm `Uploaded Photos` is empty for user B.
5. Optionally upload a JPEG as user B.
6. Confirm user B sees only user B's photo.
7. Log out and log back in as user A.
8. Confirm user A sees user A's original photo and not user B's photo.

Expected result:

- User B cannot see user A's uploaded photos.
- User A cannot see user B's uploaded photos.
- Photo listing is scoped by authenticated `user_id`.

## Scenario 4: Duplicate E-mail Rejection

Purpose: verify the invariant that two users cannot share the same e-mail.

Steps:

1. Sign up with a new e-mail.
2. Log out.
3. Try to sign up again with the same e-mail, using any display name and password.

Expected result:

- The second signup fails.
- The UI stays on the auth form and shows an error message from the failed request.

## Scenario 5: Protected Photo Routes Without Login

Purpose: verify photo actions require authentication.

Steps:

1. Open a fresh browser profile or clear site cookies for `localhost`.
2. Open `http://localhost:3000`.
3. Confirm the upload UI is not shown before signup/login.
4. Use the browser devtools network panel or curl to request `GET http://localhost:3001/photos` without cookies.

Expected result:

- The web UI does not expose upload/list controls while signed out.
- Direct unauthenticated `GET /photos` returns `401`.

## Review Notes

- If Scenario 1 fails at upload, check that MinIO is reachable through `MINIO_BROWSER_ENDPOINT=http://localhost:9000`.
- If signup fails after recreating containers, run `make migrate-identity`.
- If photo list or complete upload fails after recreating containers, run `make migrate-photo`.
- If old local database state interferes, the migration targets are idempotent and re-run the local database/user bootstrap before applying schemas.
