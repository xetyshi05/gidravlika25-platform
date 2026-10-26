# Back Office

Next.js, только для администраторов: товары и остатки, категории, фото товаров и сайта, настройки каталога, пользователи, журнал действий.

- Браузер обращается к API через BFF-прокси `src/app/api/backoffice/[...path]` с CSRF-токеном и проверкой источника (`BACKOFFICE_ORIGIN`); клиент — `src/lib/backoffice-api.ts`.
- Тайм-ауты долгих операций (удаление фона, загрузка фото) — `src/lib/backoffice-proxy.ts`.

```bash
pnpm --dir apps/backoffice dev     # http://localhost:3002
pnpm --filter backoffice test
```

Роли и доступ — [docs/roles.md](../../docs/roles.md); запуск с нуля — [docs/onboarding.md](../../docs/onboarding.md).
