# docker (local stack)

## Local context

- `docker-compose.yml` runs the local stack: infrastructure services (`postgres`, `minio`, `minio-init`, `rabbitmq`), app services (`identity-service`, `photo-service`, `api-gateway`, `web`, `media-worker`, `cluster-service`, `publication-service`, `usage-service`, `connector-service`).
- Driven via Makefile: `make dev` / `make down` / `make reset` / `make logs` / `make status`.
- Env defaults come from `.env` (template `.env.example`).

## Local invariants

- Container-to-container DB URLs use `postgres:5432`; the host port is `POSTGRES_PORT` (currently 15432).
- Services use `MINIO_ENDPOINT=http://minio:9000`; browser presigned URLs use `MINIO_BROWSER_ENDPOINT=http://localhost:9000`.
- One canonical compose file; prefer Makefile targets over ad-hoc `docker compose` invocations.
