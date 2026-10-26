# CRM

Next.js, рабочее место менеджеров: сводка, заявки по типам и статусам, карточка заявки (статус, комментарии, история), клиенты (правка, объединение дублей, экспорт и обезличивание персональных данных для администратора).

- Все обращения к API — на сервере (Server Components и Server Actions) через `src/lib/api.ts`; сессия хранится в httpOnly cookie.
- Вход с 2FA — `src/app/login`, `src/app/auth-actions.ts`.

```bash
pnpm --dir apps/crm dev     # http://localhost:3001
pnpm --filter crm test
```

Роли и доступ — [docs/roles.md](../../docs/roles.md); запуск с нуля — [docs/onboarding.md](../../docs/onboarding.md).
