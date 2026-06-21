# Session 002: Executable Project Scaffold

В этой сессии мы превратили architecture frame из Session 001 в первый исполнимый срез проекта.

Ключевой результат: локально запускается путь upload/list:

```text
web -> api-gateway -> photo-service -> MinIO + photo-db -> web
```

Пользовательский сценарий работает end to end: открыть UI, выбрать JPEG, создать upload intent через `api-gateway`, загрузить файл напрямую в MinIO по presigned PUT URL, завершить upload и увидеть фото в списке со статусом `uploaded`.

Мы собрали monorepo на `pnpm`: Next.js `web`, NestJS `api-gateway`, NestJS `photo-service`, generated TypeScript proto package, Docker Compose runtime и health-only scaffolds для остальных сервисов.

Для контрактов сохранили proto-first подход. `api-gateway` общается с `photo-service` по gRPC, а web ходит только в `api-gateway`, кроме прямого PUT в MinIO по presigned URL.

Для данных зафиксировали границу ownership: `photo-service` владеет `photo-db`; `api-gateway` и `web` не подключаются к базе. Объектные ключи для оригиналов генерируются сервером и не зависят напрямую от пользовательского имени файла.

Остальные доменные сервисы пока не реализуют бизнес-логику. Они запускаются как health-only scaffolds, чтобы локальный runtime уже имел форму будущей production architecture, но scope сессии остался строго upload/list.

По ходу E2E-проверки исправили runtime-детали, которые проявились только в полном Docker-сценарии: загрузку `.env` для migration target, Nest HTTP adapter dependencies, runtime proto imports, browser-accessible MinIO presigned URLs и маппинг proto enum status в человекочитаемый `uploaded` на HTTP-границе.

Проверки, которыми зафиксирован результат:

- `pnpm proto`
- `pnpm build`
- `pnpm test`
- `docker compose -f infra/docker/docker-compose.yml --env-file .env build`
- `make migrate-photo`
- `make smoke-upload`
- ручной browser E2E: JPEG загружается и появляется в UI со статусом `uploaded`

Также добавлены `scripts/smoke-upload.sh` и `docs/architecture-frame-verification.md`, чтобы этот frame можно было повторно проверить без восстановления контекста из истории сессии.

Следующий шаг: переходить от upload/list frame к следующему продуктово значимому слою, например EXIF/metadata extraction или preview generation, не ломая уже зафиксированные границы сервисов.
