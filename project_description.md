# Техническое задание: PhotoOps / PhotoTrail MVP

## 1. Назначение проекта

**PhotoOps** — web-платформа для превращения личного фотобанка в аннотированные фотопубликации.

Пользователь загружает пачку фотографий, система извлекает метаданные, создаёт оптимизированные версии изображений, группирует фотографии по времени и месту, предлагает готовые кластеры, из которых пользователь создаёт публикации. Публикация размещается на собственной публичной странице платформы и может быть распространена через внешние каналы, например Telegram.

MVP должен продемонстрировать полный путь:

```text
Upload photos
→ Extract metadata
→ Generate previews
→ Cluster by time/place
→ Create story from cluster
→ Annotate story/photos
→ Publish public page
→ Share link
→ See usage/cost estimate
```

Проект одновременно является личным инструментом и портфолио-кейсом, демонстрирующим backend/platform/product engineering: media ingestion, object storage, async processing, deterministic clustering, publication workflow, usage accounting, observability and multi-stack architecture.

---

## 2. Цель MVP

За две недели реализовать законченный вертикальный сценарий:

> Пользователь открывает web UI, загружает пачку фотографий из поездки, система делает превью, извлекает дату/место, группирует фото по времени и локации, пользователь создаёт из одного кластера публикацию, добавляет заголовок/текст/подписи, публикует страницу и получает ссылку.

MVP не должен быть полноценной социальной сетью, Lightroom, Instagram-клиентом или коммерческим SaaS. Основная цель — законченный рабочий продуктовый сценарий.

---

## 3. Основные пользовательские сценарии

### 3.1. Первичная настройка

Пользователь открывает web UI и может задать базовые настройки:

* название фотобанка;
* параметры публикаций по умолчанию;
* публичный display name;
* базовые настройки приватности;
* опционально — параметры Telegram-коннектора.

В MVP настройки могут быть минимальными. Достаточно иметь одну пользовательскую учётную запись или single-user mode.

---

### 3.2. Загрузка фотографий

Пользователь может загрузить пачку фотографий через web UI.

Функциональные требования:

* загрузка нескольких файлов за раз;
* поддержка JPEG как обязательный минимум;
* отображение прогресса или статуса загрузки;
* отображение списка загруженных фото;
* сохранение оригиналов в object storage;
* сохранение метаданных в базе данных;
* обработка ошибок загрузки.

Статусы фото:

```text
uploaded
processing
ready
failed
```

Для MVP достаточно web upload. Синхронизация с камерой, мобильное приложение, folder watcher и cloud imports выносятся за пределы MVP.

---

### 3.3. Обработка изображений

После загрузки система должна выполнить базовую обработку изображений.

Функциональные требования:

* извлечь EXIF metadata;
* определить дату съёмки;
* извлечь GPS-координаты, если они есть;
* сохранить raw metadata;
* создать thumbnail;
* создать preview;
* применить auto-orientation;
* сохранить информацию о размере оригинала и созданных вариантов;
* зафиксировать usage events для storage/processing.

В MVP не требуется:

* ML-анализ содержимого;
* face recognition;
* object detection;
* автоматическая оценка качества фото;
* semantic tagging.

---

### 3.4. Географическая нормализация

Если у фото есть GPS-координаты, система должна попытаться определить человекочитаемую локацию.

Желательная структура location metadata:

```text
continent
country
region
city
district
lat
lon
```

Пример:

```text
South America
Argentina
Ciudad Autónoma de Buenos Aires
Capital Federal
Monserrat
```

Требования:

* reverse geocoding должен кешироваться;
* если reverse geocoding недоступен, система должна сохранять координаты и продолжать работу;
* отсутствие GPS не должно ломать обработку фото.

Для MVP допустим упрощённый geocoding или ручной fallback.

---

### 3.5. Кластеризация фотографий

Пользователь может запустить кластеризацию фотобанка или новой загруженной пачки.

Кластеризация должна быть детерминированной, объяснимой и воспроизводимой. ML для кластеризации не используется.

Базовый принцип:

> Фотографии группируются по времени съёмки и географической близости / административной локации.

Кластер должен иметь:

```text
id
title / suggested label
date_from
date_to
location label
photo_count
cover photo
list of photos
created_at
algorithm_version
```

Пример suggested label:

```text
South America / Argentina / Buenos Aires / Monserrat
2026-01-01 — 2026-01-02
```

Минимальные правила кластеризации:

* сортировка фотографий по `taken_at`;
* группировка по временным промежуткам;
* разрыв кластера при большом time gap;
* разрыв кластера при смене страны/города/района;
* если GPS отсутствует, фото группируется по времени;
* результат должен быть стабильным при одинаковом входе и одинаковых параметрах.

Параметры кластеризации могут включать:

```text
max_time_gap_hours
max_distance_km
prefer_admin_boundary
```

В MVP кластер является read-only результатом расчёта.

Пользователь может:

* посмотреть кластер;
* использовать кластер как основу публикации;
* добавить заметку к кластеру;
* игнорировать кластер;
* пересчитать кластеризацию с другими параметрами.

Пользователь не может в MVP:

* вручную переносить фото между кластерами;
* объединять кластеры;
* разделять кластеры;
* редактировать системные границы кластера.

---

### 3.6. Заметки

Система должна предусматривать универсальную модель заметок, которые можно прикреплять к разным сущностям.

Минимальная модель:

```text
Note
  id
  entity_type
  entity_id
  body
  created_at
  updated_at
```

Возможные `entity_type`:

```text
photo
cluster
post
publication
connector
```

Для MVP достаточно реализовать заметки хотя бы для кластеров и/или публикаций.

Заметки не являются комментариями, не требуют тредов, реакций, markdown-редактора или совместного редактирования.

---

### 3.7. Создание публикации из кластера

Пользователь открывает кластер и может создать из него черновик публикации.

Публикация — это не просто альбом. Это аннотированный набор аннотированных фотографий.

Минимальная модель публикации:

```text
Post
  id
  title
  body
  status
  visibility
  location_label
  date_from
  date_to
  map_enabled
  created_at
  updated_at
```

Фотографии в публикации:

```text
PostPhoto
  post_id
  photo_id
  order
  caption
```

Статусы публикации:

```text
draft
published
unpublished
```

Visibility:

```text
private
unlisted
public
```

Функциональные требования:

* создать draft post из кластера;
* выбрать фотографии для публикации;
* задать заголовок;
* задать основной текст;
* задать подписи к отдельным фото;
* изменить порядок фото;
* включить/выключить карту;
* сохранить черновик.

Для MVP можно по умолчанию добавлять в публикацию все фото кластера.

---

### 3.8. Публикация на собственной платформе

Пользователь может опубликовать черновик.

После публикации должна появиться публичная страница.

Публичная страница должна отображать:

* title;
* body;
* дату или диапазон дат;
* место;
* фотографии;
* подписи к фотографиям;
* карту, если `map_enabled = true`;
* shareable URL.

Пример URL:

```text
/posts/buenos-aires-monserrat-2026-01-01
```

Требования:

* published post доступен по публичной ссылке;
* unlisted post доступен только по прямой ссылке;
* private post не доступен публично;
* публикацию можно снять с публикации.

---

### 3.9. Внешние коннекторы

В MVP коннекторы являются вторичными. Источник истины — собственная платформа.

Минимальный вариант:

* генерация share text;
* кнопка copy link.

Желательный вариант MVP:

* Telegram connector;
* публикация анонса и ссылки в Telegram-канал через bot token;
* сохранение статуса внешней публикации;
* сохранение внешнего message id, если доступно;
* отображение ошибки публикации, если она произошла.

Telegram-публикация в MVP может выглядеть так:

```text
New photo story: <title>
<short description>
<link>
```

Не требуется в MVP:

* публикация всех фото напрямую в Telegram;
* Instagram integration;
* Mastodon/Bluesky integration;
* сложный connector marketplace.

---

### 3.10. Usage accounting

MVP должен учитывать потребление ресурсов.

Цель — не реальные платежи, а демонстрация billing/metering model.

Система должна фиксировать usage events:

```text
photo_original_stored
photo_variant_generated
photo_processed
cluster_generated
post_published
external_share_created
```

Минимальная модель billing event:

```text
BillingEvent
  id
  user_id
  event_type
  resource_type
  quantity
  unit
  unit_price
  amount
  currency
  source_entity_type
  source_entity_id
  created_at
```

Usage dashboard должен показывать:

* количество загруженных фото;
* объём оригиналов;
* объём созданных preview/thumbnail;
* количество обработанных фото;
* количество созданных кластеров;
* количество опубликованных постов;
* estimated monthly cost.

Пример:

```text
Original storage: 842 MB
Generated previews: 118 MB
Photos processed: 126
Clusters generated: 5
Posts published: 3
Estimated monthly cost: $0.37
```

В MVP не требуется:

* Stripe;
* реальные платежи;
* подписки;
* invoices;
* taxes;
* payment failure handling.

---

## 4. Нефункциональные требования

### 4.1. Простота запуска

Проект должен запускаться локально через Docker Compose.

Минимальный local stack:

```text
web app
backend api
worker
postgres
object storage
queue/cache
```

### 4.2. Наблюдаемость

Желательно заложить:

* structured logs;
* request/correlation id;
* базовые metrics;
* job duration;
* job failures;
* queue lag;
* storage usage.

Полноценный Grafana/Prometheus/OpenTelemetry можно сделать как stretch goal.

### 4.3. Надёжность обработки

Система должна корректно переживать частичные ошибки:

* ошибка обработки одного фото не должна ломать всю загрузку;
* failed photo должно быть видно пользователю;
* повторная обработка не должна создавать дубликаты вариантов;
* jobs должны быть идемпотентными хотя бы на базовом уровне.

### 4.4. Безопасность и приватность

Минимальные требования:

* публично доступны только опубликованные public/unlisted posts;
* оригиналы фотографий не должны быть публичными по прямым object storage URL;
* для публикации используются prepared variants;
* sensitive EXIF желательно не показывать публично;
* приватные фото не должны попадать в публичные страницы.

---

## 5. Предлагаемый технологический стек

### Frontend

```text
Next.js
TypeScript
Tailwind CSS
shadcn/ui
MapLibre GL
```

Назначение:

* web UI;
* upload screen;
* photo gallery;
* cluster review;
* post editor;
* public post pages;
* usage dashboard.

### Backend API

```text
NestJS
TypeScript
PostgreSQL client / ORM
OpenAPI
```

Назначение:

* users/settings;
* photo metadata API;
* cluster API;
* post/publication API;
* usage dashboard API;
* connector settings.

### Workers

```text
Python
Pillow / pyvips
EXIF tools
queue consumer
```

Назначение:

* EXIF extraction;
* image resize;
* preview generation;
* GPS extraction;
* clustering.

Дополнительно возможно использовать Go для:

```text
scheduler
publisher worker
billing aggregator
storage reconciler
```

Но Go не обязателен для первого MVP.

### Storage

```text
PostgreSQL + PostGIS
S3-compatible object storage
MinIO for local development
Redis / BullMQ or equivalent queue
```

### Infrastructure

```text
Docker Compose
GitHub Actions
basic CI
optional OpenTelemetry / Prometheus / Grafana
```

---

## 6. Основные сущности

### User

```text
id
email
display_name
created_at
```

Для MVP допустим single-user mode.

### PhotoAsset

```text
id
user_id
original_object_key
filename
content_type
size_bytes
width
height
taken_at
lat
lon
location_id
status
metadata_json
created_at
updated_at
```

### PhotoVariant

```text
id
photo_id
variant_type
object_key
width
height
size_bytes
content_type
created_at
```

Variant types:

```text
thumbnail
preview
publish
```

### Location

```text
id
continent
country
region
city
district
lat
lon
raw_provider_data
created_at
```

### PhotoCluster

```text
id
user_id
title
location_label
date_from
date_to
photo_count
cover_photo_id
algorithm_version
parameters_json
created_at
```

### PhotoClusterItem

```text
cluster_id
photo_id
order
```

### Post

```text
id
user_id
source_cluster_id
title
body
status
visibility
slug
location_label
date_from
date_to
map_enabled
published_at
created_at
updated_at
```

### PostPhoto

```text
post_id
photo_id
order
caption
```

### Note

```text
id
user_id
entity_type
entity_id
body
created_at
updated_at
```

### BillingEvent

```text
id
user_id
event_type
resource_type
quantity
unit
unit_price
amount
currency
source_entity_type
source_entity_id
created_at
```

### PublicationAttempt

```text
id
post_id
target
status
external_id
error_message
created_at
updated_at
```

---

## 7. Границы MVP

### Входит в MVP

* web upload пачки фотографий;
* хранение оригиналов;
* генерация thumbnails/previews;
* извлечение EXIF;
* извлечение даты и GPS;
* простая географическая нормализация;
* deterministic clustering by time/place;
* read-only cluster review;
* заметка к кластеру или публикации;
* создание draft post из кластера;
* редактирование title/body/captions/order;
* публикация public/unlisted page;
* shareable link;
* usage accounting;
* basic README and demo documentation.

### Не входит в MVP

* мобильное приложение;
* автоматическая синхронизация с камерой;
* cloud photo import;
* Instagram integration;
* полноценная социальная сеть;
* лайки, комментарии, подписчики;
* сложные ACL;
* ручной split/merge кластеров;
* ML-анализ изображений;
* face recognition;
* настоящие платежи;
* Stripe;
* Kubernetes deployment;
* production-grade multi-tenancy.

---

## 8. Двухнедельный план реализации в продуктовых этапах

### День 1. Product slice

Результат:

* зафиксирован MVP-сценарий;
* создан репозиторий;
* описан user journey;
* написан черновой README;
* создана базовая структура проекта.

Критерий готовности:

> Понятно, какой сценарий должен работать в конце двух недель.

---

### День 2. Фотобанк и загрузка

Результат:

* пользователь может загрузить пачку фото;
* фото сохраняются;
* фото отображаются в UI;
* есть статусы загрузки/обработки.

Критерий готовности:

> Пользователь может положить фотографии в систему.

---

### День 3. Превью и метаданные

Результат:

* создаются thumbnails/previews;
* извлекается EXIF;
* отображается дата съёмки;
* фото удобно просматривать в галерее.

Критерий готовности:

> Сырые файлы превращаются в управляемый фотобанк.

---

### День 4. Геоданные

Результат:

* извлекаются GPS-координаты;
* создаётся location metadata;
* location отображается в UI;
* отсутствие GPS корректно обрабатывается.

Критерий готовности:

> Система понимает, где сделана фотография, если данные доступны.

---

### День 5. Кластеризация

Результат:

* пользователь запускает кластеризацию;
* система создаёт кластеры по времени и месту;
* кластеры отображаются списком;
* каждый кластер имеет label, date range, location, cover photo и photo count.

Критерий готовности:

> Из хаоса фотографий появляется понятная структура.

---

### День 6. Review clusters and create story draft

Результат:

* пользователь открывает кластер;
* видит фотографии кластера;
* может добавить заметку;
* может создать черновик публикации из кластера.

Критерий готовности:

> Кластер становится заготовкой истории.

---

### День 7. Черновик публикации

Результат:

* пользователь редактирует title/body;
* добавляет подписи к фото;
* меняет порядок фото;
* сохраняет draft.

Критерий готовности:

> Пользователь может превратить набор фото в человеческую публикацию.

---

### День 8. Публичная страница

Результат:

* draft можно опубликовать;
* появляется public/unlisted URL;
* страница показывает текст, фото, подписи, дату и место;
* публикацию можно снять с публикации.

Критерий готовности:

> История доступна по ссылке.

---

### День 9. Карта и параметры публикации

Результат:

* у публикации есть параметр `map_enabled`;
* публичная страница может показывать карту;
* visibility работает на минимальном уровне.

Критерий готовности:

> Публикация выглядит как фотоблог, а не просто галерея.

---

### День 10. Usage accounting

Результат:

* фиксируются usage events;
* считается storage usage;
* считается processing usage;
* есть usage dashboard;
* показывается estimated cost.

Критерий готовности:

> У продукта есть зачаток экономической модели.

---

### День 11. Share / Telegram connector

Результат:

* можно скопировать share text;
* желательно: можно отправить ссылку в Telegram через bot token;
* сохраняется статус внешней публикации.

Критерий готовности:

> Собственная платформа является источником истины, внешние каналы — средствами распространения.

---

### День 12. UX polish

Результат:

* empty states;
* loading states;
* error states;
* demo dataset;
* нормальные screenshots.

Критерий готовности:

> Проект выглядит как продукт, а не как набор endpoint-ов.

---

### День 13. Документация

Результат:

* README;
* architecture diagram;
* описание user journey;
* описание clustering model;
* описание publication model;
* описание usage accounting;
* local quickstart;
* known limitations;
* roadmap.

Критерий готовности:

> Проект можно понять без личного объяснения автора.

---

### День 14. Demo release

Результат:

* tagged release;
* demo screenshots/video/gif;
* финальный self-review;
* список следующих задач;
* LinkedIn post с демонстрацией результата.

Критерий готовности:

> Проект можно показать в LinkedIn и добавить в GitHub как portfolio case.

---

## 9. Definition of Done для MVP

MVP считается готовым, если можно выполнить следующий сценарий:

```text
1. Пользователь открывает web UI.
2. Загружает пачку фотографий.
3. Система сохраняет оригиналы.
4. Система создаёт thumbnails/previews.
5. Система извлекает дату и GPS/локацию.
6. Пользователь запускает кластеризацию.
7. Система предлагает несколько read-only кластеров.
8. Пользователь открывает кластер.
9. Пользователь создаёт из кластера draft post.
10. Пользователь добавляет title/body/captions.
11. Пользователь публикует post.
12. Появляется публичная страница.
13. Пользователь получает shareable link.
14. Usage dashboard показывает storage/processing usage и estimated cost.
```

---

## 10. Рекомендуемые ADR

Для портфолио-проекта желательно добавить архитектурные решения:

```text
ADR-001: Use object storage for photos instead of storing binaries in PostgreSQL
ADR-002: Use async image processing instead of request-time processing
ADR-003: Use deterministic time/place clustering instead of ML-based clustering
ADR-004: Treat own platform as source of truth and connectors as distribution channels
ADR-005: Use append-only billing ledger for usage accounting
ADR-006: Keep clusters read-only in MVP
```

---

## 11. LinkedIn-сериал

Проект можно сопровождать серией коротких постов:

```text
Day 1: Why I’m building a personal photo publishing platform
Day 2: The problem with photo dumps
Day 3: From upload to usable media library
Day 4: No ML needed: deterministic clustering by time and place
Day 5: Turning clusters into stories
Day 6: Why a post is not an album
Day 7: Publishing on my own platform first
Day 8: Connectors are distribution channels, not storage
Day 9: Usage-based billing starts with accounting, not payments
Day 10: What should be visible in a portfolio project
Day 11: Trade-offs I made to keep the MVP small
Day 12: Demo: from 100 photos to a published travel story
Day 13: What I would build next
Day 14: What this project says about backend engineering
```

Стиль постов: короткие инженерно-продуктовые заметки по 150–300 слов, желательно с одним скриншотом, схемой или фрагментом decision log.

---

## 12. Возможное развитие после MVP

После MVP можно добавить:

```text
camera sync
mobile PWA
desktop import folder watcher
Telegram upload bot
cloud photo provider import
manual split/merge clusters
advanced access control
followers/social graph
comments
RSS/Atom
static site export
Mastodon/Bluesky connectors
real billing and payments
storage quotas
OpenTelemetry/Grafana dashboards
Kubernetes/Helm deployment
```

Главное правило развития:

> Сначала законченный путь от фотобанка до опубликованной истории, потом расширение каналов, автоматизации и социальной модели.
