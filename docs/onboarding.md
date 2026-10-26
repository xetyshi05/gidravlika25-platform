# Локальный запуск с нуля

Цель — за полчаса поднять сайт, CRM, Back Office и API на своём компьютере, с тестовыми данными и рабочим входом.

## Что нужно установить

- **Node.js 22** (версия записана в `.nvmrc`; удобно через `nvm use`);
- **pnpm 10.12.1** (`corepack enable` включит нужную версию из `package.json`);
- **Docker** с Docker Compose — для PostgreSQL, локального S3 и сервиса удаления фона.

## 1. Зависимости и инфраструктура

```bash
pnpm install
docker compose up -d
```

Compose поднимает на `127.0.0.1`:

| Сервис | Адрес | Зачем |
|---|---|---|
| PostgreSQL 18 | `localhost:5432`, база `gidravlika`, пользователь `gidravlika`, пароль `gidravlika_dev_password` | основная база |
| S3 (Adobe S3Mock) | `localhost:9000`, bucket `gidravlika-catalog`; ключи не проверяются, файлы читаются без них, как в публичном bucket | фото каталога и сайта |
| image-worker | `http://localhost:8001` | удаление фона у фото товаров |

Первая сборка image-worker скачивает модель и занимает несколько минут; остальное работает и без него (не будет только загрузки фото товаров).

## 2. Файлы настроек

Скопируйте примеры и поправьте то, что отмечено ниже:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/crm/.env.example apps/crm/.env.local
cp apps/backoffice/.env.example apps/backoffice/.env.local
```

В `apps/api/.env`:

- `DATABASE_URL=postgresql://gidravlika:gidravlika_dev_password@localhost:5432/gidravlika?schema=public` — пароль из `docker-compose.yml`;
- `TWO_FACTOR_MODE=mock` и `TWO_FACTOR_MOCK_CODE=000000` — вход без приложения-аутентификатора: на шаге 2FA подходит код `000000`. В staging и production API с этим режимом не запустится;
- `S3_*` оставьте как в примере — это локальный S3 из Compose. **Никогда не указывайте здесь боевой bucket**: API в разработке меняет и удаляет файлы по-настоящему.

В `apps/web/.env.local`, `apps/crm/.env.local`, `apps/backoffice/.env.local` для локальной разработки достаточно значений из примеров; `S3_PUBLIC_URL` лучше заменить на `http://localhost:9000/gidravlika-catalog`, чтобы видеть загруженные локально фото.

Что означает каждая переменная, написано комментариями в самих `.env.example`; production-набор — в `.env.production.example` и [Развертывание.md](../Развертывание.md).

## 3. База и тестовые данные

```bash
pnpm --dir apps/api exec prisma migrate deploy
pnpm db:seed
```

`pnpm db:seed` добавляет демо-данные (повторный запуск ничего не дублирует):

| Что | Подробности |
|---|---|
| Администратор | логин `admin`, пароль `Demo-Password-2026` — CRM и Back Office |
| Менеджер | логин `manager`, пароль `Demo-Password-2026` — только CRM |
| Каталог | 3 категории, 8 товаров: обычные, с малым остатком, «под заказ» (остаток 0) и один неопубликованный черновик |
| Клиенты и заявки | 3 клиента; заявки из корзины (новая), на изготовление (в работе, с комментарием) и оптовая (завершена) |

Скрипт работает только с PostgreSQL на `localhost` и не запускается при `APP_ENV=staging|production`. Пароль тестовый и записан в репозитории — поэтому такие учётные записи никогда не должны появляться в production (там первый администратор создаётся через bootstrap, см. [Развертывание.md](../Развертывание.md)).

## 4. Запуск

```bash
pnpm dev
```

| Приложение | Адрес |
|---|---|
| Сайт | http://localhost:3000 |
| CRM | http://localhost:3001 |
| Back Office | http://localhost:3002 |
| API | http://localhost:4000 (Swagger UI — http://localhost:4000/docs) |

Первый вход сотрудника всегда проходит настройку 2FA: введите логин и пароль, на экране с QR-кодом — `000000` (в режиме `mock`), сохраните показанные резервные коды. Дальше при каждом входе снова нужен код.

Back Office принимает изменения только со своего адреса из `BACKOFFICE_ORIGIN` (`http://localhost:3002` в примере) — это защита от CSRF; открывайте его именно по этому адресу.

## 5. Как устроена работа

- Проверки перед отправкой изменений перечислены в [README](../README.md#проверки): format, lint, typecheck, тесты, сборка, при изменении схемы — API e2e и `pnpm test:migrations`.
- Изменили маршрут, DTO или ответ API — выполните `pnpm api:contract` и закоммитьте `packages/api-contract` вместе с кодом.
- Браузерные тесты: `pnpm e2e:infra && pnpm e2e:build && pnpm e2e` (свой стенд на отдельных портах, ваш `pnpm dev` не мешает).

## Частые проблемы

| Симптом | Причина |
|---|---|
| API не стартует: `Invalid environment configuration` | неверная или пустая переменная в `apps/api/.env`; текст ошибки называет её |
| `db:seed: the database has no tables` | не выполнены миграции (шаг 3) |
| Вход: «Код неверный» при `000000` | в `apps/api/.env` не включён `TWO_FACTOR_MODE=mock`, или API не перезапущен после правки |
| Фото товара не загружается | image-worker ещё собирается или не запущен: `docker compose ps` |
| `docker compose up -d`: порт 9000 занят | у вас ещё запущен старый MinIO (до перехода на S3Mock): `docker compose up -d --remove-orphans`. Локальные фото из MinIO не переносятся — загрузите их заново |
| Картинки каталога не отображаются | `S3_PUBLIC_URL` приложения не совпадает с `http://localhost:9000/gidravlika-catalog` |
