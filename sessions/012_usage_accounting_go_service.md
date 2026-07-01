# Сессия 012: Go-сервис учёта потребления ресурсов (usage-плоскость)

Статус: **Done — смёржена в `main` (`--no-ff`, PR #1) с ветки
`session-012-usage-accounting-go-service`.** Выполнена как
executable-spec / skeleton-first SDD: эфемерный брейншторм → апрувнутый
skeleton-коммит (спека) → subagent-driven наполнение GREEN (per-task ревью;
Important-фикс pgx-uuid пойман до smoke) → финальный whole-branch `/code-review`
= ready-to-merge. `make gate` зелёный (TS + media-worker + usage-service,
golangci-lint 0); **live e2e зелёный** (`make smoke-usage` против Docker-стека:
upload → обработка → эмит → ledger → authed-сводка → итемизированные события +
фильтр; идемпотентность стабильна); CI на `main` зелёный.
Эпики `photo_ops-2c2` (core) + `photo_ops-pwf` (UI add-on) закрыты;
`photo_ops-78z` (Go toolchain/CI) закрыт. ADR: `docs/adr/0004-usage-accounting-ledger.md`.
Сессия **разблокировала 013** (кластеризация эмитит сюда).

> Исходно это была seed-заготовка (дизайн не выработан), поэтому 012 стартовала с
> брейншторма. Ниже — итог: цель, принятые решения (why — в ADR-0004), что
> отгружено, верификация и швы. Контракты/код не дублируются прозой — они в
> proto/миграции/тестах.

## Метод (executable-spec / skeleton-first SDD — как исполнено)

Канон: `docs/agent-workflow-evolution.md` Decision 1. Форма (исполнена):
`эфемерный брейншторм → skeleton-коммит (stub-сигнатуры + RED-тесты +
proto + миграция) = спека, апрув как единица → наполнение GREEN (subagent-driven,
свежий имплементер на задачу) → ADR на why`. Маршрутизация: контракты/структура →
proto/stubs/миграции; поведение → тесты; why/инварианты/отвергнутое → `docs/adr` +
`bd remember` + `## Local invariants`. Архитектурно-чувствительно (новый bounded
context + БД + кросс-сервисный async-контракт + sync-RPC + новый язык) → полный
финальный `/code-review`.

## Цель

> Кросс-сервисная **usage-плоскость на Go**: принимать события потребления ресурсов
> от операций, хранить их в append-only леджере с пооперационной атрибуцией и
> показывать потребление + оценочную стоимость. Учёт, не реальные платежи.

## Почему Go здесь (решение предыдущей сессии)

Разнести **измерение** и **агрегацию/биллинг**:
- **Измерение** — в рантайме самой операции (media-worker, кластеризатор сами знают
  расход); Go там не нужен.
- **Агрегация/учёт/биллинг** — cross-cutting плоскость (потребление отовсюду),
  обязана быть дешёвой и конкурентной (иначе метеринг раздувает счёт против цели).
  Это вотчина Go: низкий overhead, предсказуемая память, конкурентность. Сюда же
  §5-ТЗ оркестровочные шеллы (scheduler, billing-aggregator, storage-reconciler).
- Go не пихаем в математику/CRUD ради полиглотности — его дом здесь. (Первый Go-сервис репо.)

## Принятые решения (why — в `docs/adr/0004-usage-accounting-ledger.md`)

- **Emit, не pull.** Операции публикуют `ConsumptionEvent` (proto) в RabbitMQ
  `usage.events` (канон durable + DLX/DLQ); usage-service консьюмит. Чужие БД не
  читает (DB-ownership). Зеркало паттерна `photo.process`/`photo.result`.
- **Леджер — сырые провайдеро-независимые единицы + провенность; деньги — на чтении.**
  `billing_events` хранит `resource_type/quantity/unit` + `provider` + `occurred_at`;
  колонок `unit_price/amount/currency` **нет** (осознанное отклонение от ТЗ §6 —
  ADR-0004). Прайсинг — резолвер на чтении, **отделимый модуль** (будущий pricing-service).
- **Провенность штампует инстанс-продюсер** (`provider` из env + `occurred_at`);
  тарифы владеет usage-service (time-effective rate-card по провайдеру — шов). Решает
  кейс «разные сервисы/инстансы на разных провайдерах по разным сеткам в разное время».
- **Charge-once** — inbox `processed_events` (`INSERT … ON CONFLICT DO NOTHING` в
  одной tx с строками леджера); реплей over at-least-once брокера = no-op.
- **Storage — bytes-level сейчас**, `byte_seconds`-интеграл = storage-reconciler (шов).
- **Первый продюсер — photo-service** (эмитит на CompleteUpload + успехе обработки,
  best-effort — эмит не ломает upload/обработку).

## Что отгружено

- **usage-service (Go):** владеет `usage-db`. `billing_events` (append-only) +
  `processed_events` (inbox); pgxpool-store; amqp091-consumer (`usage.events`);
  gRPC `GetUsageSummary` + `ListUsageEvents` + `Health`; `StaticResolver` (прайсинг,
  отделим). Ядро `internal/usage` — stdlib-only, провайдеро-независимое.
- **Контракт (proto):** `usage/v1/consumption.proto` (`ConsumptionEvent`/`Measurement` —
  сырьё + провенность, без денег) + `usage_service.proto` (summary + events RPC).
- **photo-service:** эмитит события потребления (storage на CompleteUpload; варианты +
  processed на успехе job), best-effort.
- **api-gateway:** session-authed `GET /v1/usage/summary` + `GET /v1/usage/events`.
- **Тулчейн:** Go-lane в `make gate` (`gate-usage`: go vet + golangci-lint + go test) +
  CI-job + Dockerfile + compose + `migrate-usage`. (`mise` — отложен в `photo_ops-lz1`,
  конфига нет.) **Bonus:** починен предсуществующий CI-баг `photo_ops-qwg` (typecheck
  до build → `build-libs` пререквизит; main был красный с ~25 июня).
- **Docs:** ADR-0004; `docs/domain-model.md` + `docs/architecture.md` обновлены;
  `docs/e2e-usage-accounting.md`; 2 плана.

## Add-on: детальный usage-отчёт по операциям (эпик `photo_ops-pwf`)

По запросу владельца, тем же exSDD-циклом на той же ветке:
- **`ListUsageEvents` RPC** — итемизированные строки леджера (одна строка = одно
  измерение) со стоимостью на строку (`quantity × unit_price`, цена по провенности
  **самой строки**), фильтры (диапазон `occurred_at`, `resource_type`, `event_type`),
  пагинация, `filtered_total_amount` по всему фильтру. Гранулярность — line items
  (без миграции; пооперационный rollup → `photo_ops-8t5`).
- **gateway** `GET /v1/usage/events` (authed) + **web `/usage`** (Next.js): сводка-шапка +
  фильтр-бар (даты / тип ресурса / тип операции) + таблица line items + пагинация.

## Верификация (достигнуто)

- Unit (Go): `Explode` (маппинг сырья), `Ledger.Record` (append-only + charge-once
  реплей), `StaticResolver`, `BuildSummary`, `BuildEventLines`/`EventsForUser`.
- Unit (TS): `UsageEmitter` (photo-service) — ключи/измерения; gateway query→gRPC
  маппинг + auth; web `lib/api` query-строка + `UsageReport` (загрузка + рефетч по фильтру).
- pg-SQL / amqp-топология / grpc / gateway / web-виджеты — smoke/e2e-pinned (in-process
  DB-тесты = `photo_ops-4vg`, отложены), зеркалит паттерн репо.
- **`make gate` зелёный**; **`make smoke-usage` зелёный** (полный e2e + events + фильтр);
  финальный `/code-review` = ready-to-merge (0 Critical/Important; дешёвый id-тайбрейкер применён).

## Follow-ups / швы (беды заведены)

- **Сырые единицы (feedback владельца):** `photo_ops-9u5` (processing → `cpu_seconds`,
  само-метеринг), `photo_ops-590` (RAM → `byte_seconds`), `photo_ops-n48`
  (storage → `byte_seconds`, storage-reconciler). Сейчас processing = счётчик `operation`,
  storage = одноразовый `byte`-уровень.
- `photo_ops-8t5` (пооперационный rollup отчёта); `photo_ops-rh0` (UI-полиш фильтров:
  shadcn Combobox, «0 результатов»-хинт, локализация дат).
- `photo_ops-03x` (amqp-consumer initial-connect retry); `photo_ops-osq` (coverage-тулинг).
- Прайсинг-швы (ADR-0004): версионируемые/мультипровайдерные rate-cards, материализация/
  price-snapshot, отдельный pricing-service.
- `photo_ops-pb6` (OTel/метрики) — **разблокирован** (первый Go gRPC-сервис существует).

## Зависит от / блокирует

- **Разблокировала 013** (кластеризация само-меряется и эмитит `ConsumptionEvent` в
  `usage.events`, `idempotency_key = result_id`; контракт — в `bd remember` + ADR-0004).
- Построена на: RabbitMQ-паттерн + session-auth gateway (main); 008-швы (usage-ready).

## Ссылки

- ADR (why): `docs/adr/0004-usage-accounting-ledger.md`.
- Планы (skeleton): `docs/superpowers/plans/2026-06-30-usage-accounting-go-service.md`,
  `docs/superpowers/plans/2026-06-30-usage-report-ui-addon.md`.
- e2e-сценарий: `docs/e2e-usage-accounting.md`.
- Метод: `docs/agent-workflow-evolution.md` (Decision 1).
- Границы/домен: `docs/architecture.md`, `docs/domain-model.md`; ТЗ `project_description.md` §3.10, §4, §6.
