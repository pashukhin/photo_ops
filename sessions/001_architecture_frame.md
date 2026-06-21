# Session 001: Architecture Frame

В этой сессии мы разобрали исходное описание PhotoOps и отделили полный MVP от первого исполнимого среза.

Ключевое решение: первый результат проекта — это architecture frame, а не весь MVP. Полный MVP заканчивается опубликованной публичной фотосторией, а первый frame заканчивается upload/list.

Мы выбрали production-shaped архитектуру с отдельными deployable domain services с первого дня: web, api-gateway, photo-service, media-worker, cluster-service, publication-service, usage-service и connector-service.

Зафиксировали data ownership: каждый сервис владеет только данными, которые создаёт и изменяет. Для владельцев данных используем отдельные DB с первого дня, локально — один Postgres container с несколькими database/user pairs.

Для контрактов выбрали proto-first подход: gRPC для внутренних sync API, `google.api.http` для HTTP mapping, OpenAPI generation для документации, RabbitMQ для async workflows позже.

Для upload flow выбрали presigned MinIO PUT + `CompleteUpload`, чтобы бинарный трафик не шёл через application services.

Технологически зафиксировали Next.js для web, NestJS для api-gateway и photo-service, Python для media worker, Go для cluster service.

В итоге закоммичены исходное описание проекта, architecture frame spec и implementation plan для Stage 0/1.

Следующий шаг: в отдельной сессии выполнить план и собрать executable project scaffold, где можно открыть UI, загрузить JPEG и увидеть его в списке со статусом `uploaded`.
