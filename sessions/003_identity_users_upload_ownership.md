# Session 003: Identity Users Upload Ownership

В этой сессии мы добавили многопользовательский контур к первому executable frame.

Ключевой результат: upload/list больше не является глобальным списком фотографий. Пользователь сначала регистрируется или логинится по e-mail/password, затем загружает JPEG, а `photo-service` сохраняет и возвращает только фотографии текущего пользователя.

Архитектурное решение: добавить отдельный `identity-service` как владельца пользователей, password credentials и sessions. `api-gateway` остался без базы данных: он работает с HTTP-only cookie, валидирует session через `identity-service` и передаёт authenticated `user_id` в `photo-service` явным полем gRPC-запроса.

Данные по-прежнему принадлежат сервисам. `identity-service` владеет `identity-db`, `photo-service` владеет `photo-db`. Cross-service ссылка `photo_assets.user_id` является UUID reference без foreign key в другую базу.

Перед реализацией мы отдельно описали доменную модель: текущее состояние, проектное состояние, владельцев сущностей и статусы. Это зафиксировано в `docs/domain-model.md`.

Реализованные пользовательские возможности:

- signup по e-mail/password;
- login/logout;
- HTTP-only session cookie;
- authenticated `/auth/me`;
- upload intent только для authenticated user;
- list photos только для authenticated user;
- complete upload только владельцем фото;
- web UI для signup/login/logout/upload/list.

Инструменты и проверки, добавленные в сессии:

- `proto/identity/v1/identity_service.proto`;
- `apps/identity-service` как новый NestJS сервис;
- `make migrate-identity`;
- `scripts/smoke-auth-upload-ownership.sh` для backend e2e-проверки двух пользователей;
- `docs/e2e-auth-upload-ownership.md` с ручными e2e-сценариями;
- правило в `AGENTS.md`: e2e-сценарий должен быть написан и утверждён до начала реализации.

По ходу runtime-проверки обнаружили stale local Postgres state от предыдущего frame: старый volume не содержал `identity_db`, а старая `photo_assets` не содержала `user_id`. Вместо удаления volume сделали bootstrap и migrations идемпотентными: migration targets теперь сначала гарантируют наличие local database/user pairs, затем применяют service schema.

Проверки, которыми зафиксирован результат:

- `pnpm proto`;
- `pnpm test`;
- `pnpm build`;
- `make migrate-identity`;
- `make migrate-photo`;
- `scripts/smoke-auth-upload-ownership.sh` с результатом `auth upload ownership smoke ok`.

Процессное решение: в этом проекте не использовать git worktrees, потому что они конфликтуют с beads workflow. Для feature work используем обычные ветки через `git switch -c`.

Следующий шаг: перед code review пройти ручные e2e-сценарии из `docs/e2e-auth-upload-ownership.md`, затем либо создать PR, либо локально смержить ветку после review.
