import { CatalogFilters } from "@/components/catalog/catalog-filters";
import {
  getCatalogCategories,
  getCatalogProductFilterRanges,
  getCatalogProductsPage,
  getCatalogSettings,
} from "@/lib/catalog-api";
import {
  CATALOG_PAGE_SIZE,
  mergeCatalogPages,
  normalizeCatalogProductFilters,
  parseCatalogFilterParams,
  parseCatalogPageParam,
  serializeCatalogFilterParams,
} from "@/lib/catalog-filter-url";
import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/site";

export const revalidate = 60;
export const metadata: Metadata = createPageMetadata({
  title: "Каталог гидроцилиндров",
  description:
    "Каталог гидроцилиндров Магистр: цены, наличие и подбор по диаметру поршня, штока и рабочему ходу. Доставка по России.",
  path: "/catalog",
});

type CatalogPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const query = await searchParams;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) search.append(key, item);
    }
  }
  const requestedFilters = {
    ...parseCatalogFilterParams(search),
    // Фильтр наличия больше не предлагается в каталоге: старые URL не должны
    // продолжать скрыто ограничивать выдачу.
    availability: undefined,
  };
  const [categories, filterRanges, settings] = await Promise.all([
    getCatalogCategories(24),
    getCatalogProductFilterRanges(),
    getCatalogSettings(),
  ]);
  const normalizedFilters = normalizeCatalogProductFilters(
    requestedFilters,
    filterRanges,
    categories,
    settings,
  );
  // `?page=N` shows the first N pages (WEB-04), so «Назад» from a product
  // returns to the list that was loaded with «Показать ещё».
  const loadPage = (page: number) =>
    getCatalogProductsPage({ ...normalizedFilters, page, pageSize: CATALOG_PAGE_SIZE });
  const firstPage = await loadPage(1);
  const lastPage = Math.min(parseCatalogPageParam(search), firstPage.totalPages);
  const productsPage =
    lastPage > 1
      ? mergeCatalogPages([
          firstPage,
          ...(await Promise.all(
            Array.from({ length: lastPage - 1 }, (_, index) => loadPage(index + 2)),
          )),
        ])
      : firstPage;
  const queryString = serializeCatalogFilterParams(normalizedFilters);

  return (
    <CatalogFilters
      key={queryString}
      categories={categories}
      filterRanges={filterRanges}
      settings={settings}
      initialPage={productsPage}
      queryString={queryString}
    />
  );
}
