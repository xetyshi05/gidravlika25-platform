# API

NestJS + Prisma (PostgreSQL). Вся бизнес-логика: каталог, публичные заявки, CRM, Back Office, вход с 2FA, фото, персональные данные.

| Модуль | Что делает |
|---|---|
| `src/catalog` | публичный каталог и настройки его показа |
| `src/requests` | публичные заявки (антиспам ALTCHA, Idempotency-Key, согласия) и работа с ними в CRM |
| `src/customers` | клиенты: поиск дублей, объединение, экспорт и обезличивание персональных данных |
| `src/auth` | вход, 2FA, резервные коды, блокировки |
| `src/backoffice` | каталог, остатки, фото (S3, image-worker, очередь удаления), пользователи, журнал действий |
| `src/address` | подсказки адреса DaData с суточным лимитом |
| `src/ops`, `src/health`, `src/observability` | `/ready`, `/metrics`, `/ops/status`, структурированные логи |
| `src/openapi` | контракт OpenAPI (`pnpm api:contract` в корне) |
| `prisma/` | схема, миграции, роли БД (`database-roles.sql`) |
| `scripts/` | демо-данные (`pnpm db:seed`), импорт каталога из старой системы |

```bash
pnpm --dir apps/api dev                          # http://localhost:4000, Swagger UI на /docs
pnpm --dir apps/api exec prisma migrate deploy   # применить миграции
pnpm --dir apps/api exec jest --runInBand        # unit-тесты
pnpm --dir apps/api test:e2e                     # e2e на временной PostgreSQL
pnpm --dir apps/api test:migrations              # схема ↔ миграции без расхождений
```

Все переменные окружения описаны в `.env.example`. Запуск с нуля — [docs/onboarding.md](../../docs/onboarding.md).
