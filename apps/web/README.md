# Сайт

Next.js: главная, каталог с фильтрами, страница товара, корзина и оформление заявки, заявки на изготовление и опт, юридические страницы.

- `src/app` — страницы; `src/components` — интерфейс; `src/lib` — работа с API, фильтры каталога, антиспам.
- Данные берутся из API по контракту (`src/lib/api-client.ts`, `catalog-api.ts`, `requests-api.ts`); ответы каталога кешируются на 60 с и сбрасываются вебхуком `/api/revalidate-catalog` после правок в Back Office.
- `NEXT_PUBLIC_*` встраиваются в сборку: после их изменения нужна пересборка.

```bash
pnpm --dir apps/web dev     # http://localhost:3000
pnpm --filter web test      # unit-тесты src/lib
```

Настройки — `.env.example`; запуск с нуля — [docs/onboarding.md](../../docs/onboarding.md).
