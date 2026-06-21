# Architecture Frame Verification

## Verified Scenario

The first executable frame ends with upload/list, not the full MVP.

Verified path:

```text
web -> api-gateway -> photo-service -> MinIO + photo-db -> web
```

## Commands

```bash
cp .env.example .env
make install
make proto
docker compose -f infra/docker/docker-compose.yml --env-file .env build
make dev
make migrate-photo
make smoke-upload
```

## Automated Smoke Check

`scripts/smoke-upload.sh` creates an upload intent, uploads a tiny JPEG through the presigned URL, completes the upload, lists photos, and verifies the uploaded photo is present with status `uploaded`.

## Manual Check

1. Open `http://localhost:3000`.
2. Upload a JPEG smaller than 25 MB.
3. Confirm the file appears in the uploaded photos list with status `uploaded`.
4. Upload a `.txt` file and confirm the UI shows an unsupported-file error.

## Known Limits

- EXIF extraction is not implemented in this frame.
- Preview generation is not implemented in this frame.
- Clustering is not implemented in this frame.
- Publication is not implemented in this frame.
