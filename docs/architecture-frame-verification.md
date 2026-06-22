# Architecture Frame Verification

## Verified Scenario

The first executable frame ends with upload/list, not the full MVP.

Verified path:

```text
web -> api-gateway -> identity-service + photo-service -> MinIO + identity-db + photo-db -> web
```

## Commands

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

## Automated Smoke Check

`scripts/smoke-auth-upload-ownership.sh` signs up two users, uploads a tiny JPEG as the first user through the presigned URL, completes the upload, verifies the first user can list it with status `uploaded`, and verifies the second user cannot list or complete the first user's photo.

## Manual Check

1. Open `http://localhost:3000`.
2. Sign up with an e-mail, password, and display name.
3. Upload a JPEG smaller than 25 MB.
4. Confirm the file appears in the uploaded photos list with status `uploaded`.
5. Log out and sign up as a second user.
6. Confirm the second user's photo list does not show the first user's photo.

## Known Limits

- EXIF extraction is not implemented in this frame.
- Preview generation is not implemented in this frame.
- Clustering is not implemented in this frame.
- Publication is not implemented in this frame.
