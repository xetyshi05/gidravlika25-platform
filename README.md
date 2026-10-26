# Гидравлика 25

Monorepo продукта «Гидравлика 25»:

- `apps/web` — публичный сайт и каталог;
- `apps/crm` — рабочее место отдела продаж;
- `apps/backoffice` — управление каталогом и пользователями;
- `apps/api` — NestJS API и PostgreSQL/Prisma.

Документация — в [docs/](docs/README.md): запуск с нуля, архитектура и потоки данных, роли, действия при сбоях, секреты, принятые решения.

## Локальная разработка

```bash
pnpm install
docker compose up -d                              # PostgreSQL, локальный S3, image-worker на 127.0.0.1
pnpm --dir apps/api exec prisma migrate deploy
pnpm db:seed                                      # демо-данные: admin / manager, пароль Demo-Password-2026
pnpm dev                                          # сайт :3000, CRM :3001, Back Office :3002, API :4000
```

Перед первым запуском скопируйте `.env.example` приложений и включите в `apps/api/.env` `TWO_FACTOR_MODE=mock` (код 2FA — `000000`). Подробно, с частыми проблемами, — [docs/onboarding.md](docs/onboarding.md). В `apps/api/.env` для S3 указывайте только локальный S3 из Compose: API в разработке меняет и удаляет файлы по-настоящему.

## Проверки

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --dir apps/api test:e2e
```

`pnpm typecheck` проверяет типы вместе с тестами (для Next.js-приложений сначала генерирует типы маршрутов `next typegen`), `pnpm test` запускает unit-тесты всех приложений. E2E-тесты API создают отдельную временную базу PostgreSQL и удаляют её после завершения.

Замер запросов CRM на больших объёмах (PERF-01) — не входит в CI, запускается при изменении списков, сортировок и индексов:

```bash
pnpm --dir apps/api test:perf
```

Он так же создаёт временную базу, заполняет её синтетикой (100 000 клиентов, около 250 000 заявок и 500 000 записей истории), печатает медианы ключевых запросов и план сортировки клиентов по активности и падает, если запрос стал на порядок медленнее.

Контракт API (OpenAPI) лежит в `packages/api-contract`: `openapi.json`, TypeScript-типы `src/schema.d.ts` и общий клиент `@gidravlika25/api-contract/client` (`openapi-fetch` с таймаутом), через который сайт, CRM и Back Office обращаются к API. Оба файла генерируются из контроллеров API. Запросы описывают DTO, ответы — классы `*.response.ts`; контроллеры объявлены с этими типами, поэтому TypeScript не даст сервису вернуть другое. После изменения маршрута, DTO или ответа (генерация заодно проверяет, что плагин Swagger не потерял ни одного поля DTO или ответа — такое бывает, например, с `@Min(-КОНСТАНТА)`; тогда поле описывается явно через `@ApiProperty`):

```bash
pnpm api:contract        # пересобрать API и обновить packages/api-contract
pnpm api:contract:check  # то же без записи: CI падает, если контракт устарел
```

API e2e дополнительно сверяет каждый JSON-ответ сценариев (в том числе ошибки) со схемой в строгом режиме: недокументированное поле — ошибка. При локальном запуске API (`APP_ENV=development` в `apps/api/.env`) Swagger UI открыт на `http://localhost:4000/docs`; при `NODE_ENV=production` или `test`, а также в staging и production его нет.

Браузерные E2E-тесты (Playwright и axe, нужен Docker):

```bash
pnpm e2e:infra   # PostgreSQL и S3 (S3Mock) стенда, e2e/compose.yml
pnpm e2e:build   # API и три Next.js-приложения с адресами стенда
pnpm e2e
pnpm e2e:down
```

Стенд работает на своих портах (API 4100, сайт 3100, CRM 3101, Back Office 3102, PostgreSQL 55432, S3 9100) и не мешает `pnpm dev`. Все переменные окружения задаются в `e2e/environment.mjs`, а ключи из локальных `.env` приложений обнуляются, поэтому тесты не видят базу разработки и настоящий S3. При каждом запуске база пересоздаётся и заполняется данными из `e2e/fixtures/data.mjs`; 2FA работает в mock-режиме (код `000000`), удаление фона заменяет мок `e2e/servers/mock-image-worker.mjs`. Сценарии: вход с настройкой 2FA и неверным кодом, перевыпуск резервных кодов и выход, экспорт персональных данных клиента, изменение остатка в Back Office, отказ менеджеру в Back Office, заявка из корзины → CRM (статус и комментарий), 409 при одновременной правке клиента, публикация товара в Back Office → сайт, загрузка фото товара в S3, axe (WCAG 2.1 AA) на ключевых экранах сайта, CRM и Back Office. После `pnpm build` перед `pnpm e2e` снова нужен `pnpm e2e:build` (сайт встраивает адрес API при сборке; без этого тесты не запустятся). Отчёт при падении — `e2e/test-results` (trace открывается `pnpm --filter e2e exec playwright show-trace …`).

Проверки инфраструктуры (нужен Docker):

```bash
./deploy/scripts/test-nginx-perimeter.sh
./deploy/scripts/test-backup.sh
./deploy/scripts/test-production-images.sh
```

Последний собирает production-образы из `compose.production.yml`, запускает их так же, как `deploy.sh` (роли БД, миграции, API, image-worker, сайт, CRM, Back Office), и проверяет каждый контейнер изнутри: readiness API и запросы через Prisma, удаление фона без сети, страницы Next.js. Значения окружения — тестовые, из `deploy/ci/production-images.env`.

CI (`.github/workflows/ci.yml`) выполняет всё перечисленное, а также проверяет лицензии production-зависимостей по `config/license-policy.json` (`pnpm licenses:check`; новая или неизвестная лицензия останавливает CI — её нужно рассмотреть и внести в политику с причиной) и для каждого production-образа сохраняет SBOM в формате CycloneDX (артефакт `sbom` запуска, 90 дней). Сторонние Docker-образы закреплены по digest; обновления зависимостей, образов и actions еженедельно предлагает Dependabot (`.github/dependabot.yml`) — каждое проходит CI. Python-пакеты image-worker Dependabot не обновляет: они обновляются вручную через pip-compile (см. шапку `services/image-worker/requirements.lock`). Job `browser-e2e` поднимает тот же стенд и при падении прикладывает отчёт Playwright к запуску. Job `images` собирает образы через `docker buildx bake` с кэшем GitHub Actions (кэш общий для репозитория, до 10 ГБ; старые слои вытесняются автоматически). Сторонние actions закреплены по SHA коммита с комментарием версии; Dependabot обновляет оба.

## Production

Развёртывание сервера с нуля — [Развертывание.md](Развертывание.md); TLS, резервные копии, восстановление, откат и мониторинг — [deploy/README.md](deploy/README.md); действия при сбоях и смена секретов — [docs/runbooks.md](docs/runbooks.md) и [docs/secrets.md](docs/secrets.md).
