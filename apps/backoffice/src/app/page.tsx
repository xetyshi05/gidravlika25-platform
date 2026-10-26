"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  IconAlertCircle,
  IconArrowRight,
  IconBox,
  IconCircleOff,
  IconPhotoOff,
  IconRefresh,
  IconTagOff,
} from "@tabler/icons-react";
import { EmptyState, LoadingState, PageHeader, StatusBadge } from "@/components/ui";
import { ServerResourcesPanel } from "@/components/server-resources-panel";
import { getCategories, getProducts } from "@/lib/backoffice-api";
import type { Category, Product } from "@/data/catalog";
export default function Dashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextProducts, nextCategories] = await Promise.all([getProducts(), getCategories()]);
      setProducts(nextProducts);
      setCategories(nextCategories);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить обзор каталога.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  const stats = [
    ["Всего товаров", products.length],
    ["Активных", products.filter((p) => p.isActive).length],
    ["Нет в наличии", products.filter((p) => p.stockQuantity === 0).length],
    ["Категорий", categories.length],
  ];
  const attention = [
    ["Без изображения", products.filter((p) => !p.imagePath).length, IconPhotoOff, "without-image"],
    ["Без цены", products.filter((p) => Number(p.price) === 0).length, IconTagOff, "without-price"],
    [
      "Нет в наличии",
      products.filter((p) => p.stockQuantity === 0).length,
      IconBox,
      "out-of-stock",
    ],
    ["Неактивные товары", products.filter((p) => !p.isActive).length, IconCircleOff, "inactive"],
  ] as const;
  const recent = useMemo(
    () => [...products].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4),
    [products],
  );
  return (
    <main>
      <PageHeader eyebrow="ОБЗОР КАТАЛОГА" title="Главная" />
      <div className="space-y-6 px-5 py-6 sm:px-8 lg:px-10">
        <ServerResourcesPanel />
        {loading && products.length === 0 ? (
          <section className="rounded-md border border-line bg-surface">
            <LoadingState label="Загружаем обзор каталога…" />
          </section>
        ) : error && products.length === 0 ? (
          <section
            role="alert"
            className="grid min-h-64 place-items-center rounded-md border border-line bg-surface p-6 text-center"
          >
            <div className="max-w-md">
              <IconAlertCircle className="mx-auto size-9 text-brand" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-bold text-copy">Не удалось загрузить данные</h2>
              <p className="mt-2 text-sm leading-6 text-copy-muted">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-bold text-white hover:bg-brand-dark"
              >
                <IconRefresh className="size-4" aria-hidden="true" />
                Попробовать ещё раз
              </button>
            </div>
          </section>
        ) : (
          <DashboardContent
            products={products}
            categories={categories}
            stats={stats}
            attention={attention}
            recent={recent}
          />
        )}
      </div>
    </main>
  );
}

function DashboardContent({
  products,
  categories,
  stats,
  attention,
  recent,
}: {
  products: Product[];
  categories: Category[];
  stats: (string | number)[][];
  attention: readonly (readonly [string, number, typeof IconBox, string])[];
  recent: Product[];
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(([label, value]) => (
          <section key={label} className="rounded-md border bg-surface p-5">
            <p className="text-sm font-semibold text-copy-muted">{label}</p>
            <p className="mt-3 text-3xl font-extrabold">{value}</p>
          </section>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-md border bg-surface">
          <div className="flex justify-between border-b p-5">
            <h2 className="font-bold">Требуют внимания</h2>
            <Link href="/products" className="text-sm font-bold text-brand">
              Все товары
            </Link>
          </div>
          {attention.map(([label, count, Icon, attention]) => (
            <Link
              href={`/products?attention=${attention}`}
              key={label}
              className="flex items-center gap-3 border-b px-5 py-4 last:border-0 hover:bg-surface-raised"
            >
              <Icon className="size-4 text-copy-muted" />
              <span className="text-sm font-semibold">{label}</span>
              <span className="ml-auto font-extrabold">{count}</span>
              <IconArrowRight className="size-4 text-copy-faint" />
            </Link>
          ))}
        </section>
        <section className="rounded-md border bg-surface">
          <div className="border-b p-5">
            <h2 className="font-bold">Последние изменения</h2>
          </div>
          {recent.length > 0 ? (
            recent.map((product) => (
              <Link
                href="/products"
                key={product.id}
                className="flex items-center justify-between border-b px-5 py-4 last:border-0 hover:bg-surface-raised"
              >
                <div>
                  <p className="text-sm font-bold">{product.name}</p>
                  <p className="text-xs text-copy-muted">{product.sku}</p>
                </div>
                <StatusBadge active={product.isActive} stock={product.stockQuantity} />
              </Link>
            ))
          ) : (
            <EmptyState
              title="Каталог пока пуст"
              description="Добавьте первый товар, чтобы статистика и последние изменения появились здесь."
              action={
                <Link
                  href="/products"
                  className="inline-flex h-9 items-center rounded-md bg-brand px-4 text-sm text-white hover:bg-brand-dark"
                >
                  Перейти к товарам
                </Link>
              }
            />
          )}
        </section>
      </div>
      <span className="sr-only">
        Загружено товаров: {products.length}, категорий: {categories.length}
      </span>
    </>
  );
}
