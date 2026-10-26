"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { IconX } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { ProductCard } from "@/components/catalog/product-card";
import { CustomProductionRequestModal } from "@/components/home/custom-production-request-modal";
import { OZON_URL, OzonBuyBadge } from "@/components/brand/partner-marks";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type {
  CatalogCategory,
  CatalogProductFilters,
  CatalogProductFilterRanges,
  CatalogProductsPage,
  CatalogSettings,
} from "@/lib/catalog-api";
import { customOrderComment } from "@/lib/custom-order-prefill";
import { timedFetch } from "@/lib/api-client";
import { browserApi } from "@/lib/browser-api";
import { isRequestAbort, isRequestTimeout } from "@/lib/fetch-with-timeout";
import {
  CATALOG_PAGE_SIZE,
  catalogPageHref,
  catalogPageQuery,
  parseCatalogFilterParams,
  parseCatalogPageParam,
  serializeCatalogFilterParams,
} from "@/lib/catalog-filter-url";
import { useModalAccessibility } from "@/lib/use-modal-accessibility";

type RangeKey =
  | "price"
  | "pistonDiameterMm"
  | "rodDiameterMm"
  | "strokeMm"
  | "collapsedLengthMm"
  | "maxPressureMpa"
  | "nominalPressureMpa";
type RangeValue = { min: number; max: number };
type MinRangeParam =
  | "minPrice"
  | "minPistonDiameter"
  | "minRodDiameter"
  | "minStroke"
  | "minCollapsedLength"
  | "minMaxPressure"
  | "minNominalPressure";
type MaxRangeParam =
  | "maxPrice"
  | "maxPistonDiameter"
  | "maxRodDiameter"
  | "maxStroke"
  | "maxCollapsedLength"
  | "maxMaxPressure"
  | "maxNominalPressure";
type RangeConfig = {
  key: RangeKey;
  label: string;
  unit: string;
  step: number;
  minParam: MinRangeParam;
  maxParam: MaxRangeParam;
};

const rangeConfigs: RangeConfig[] = [
  { key: "price", label: "Цена", unit: "₽", step: 100, minParam: "minPrice", maxParam: "maxPrice" },
  {
    key: "pistonDiameterMm",
    label: "Диаметр поршня",
    unit: "мм",
    step: 1,
    minParam: "minPistonDiameter",
    maxParam: "maxPistonDiameter",
  },
  {
    key: "rodDiameterMm",
    label: "Диаметр штока",
    unit: "мм",
    step: 1,
    minParam: "minRodDiameter",
    maxParam: "maxRodDiameter",
  },
  {
    key: "strokeMm",
    label: "Рабочий ход",
    unit: "мм",
    step: 1,
    minParam: "minStroke",
    maxParam: "maxStroke",
  },
  {
    key: "collapsedLengthMm",
    label: "Размер в сложенном состоянии",
    unit: "мм",
    step: 1,
    minParam: "minCollapsedLength",
    maxParam: "maxCollapsedLength",
  },
  {
    key: "maxPressureMpa",
    label: "Максимальное давление",
    unit: "МПа",
    step: 0.1,
    minParam: "minMaxPressure",
    maxParam: "maxMaxPressure",
  },
  {
    key: "nominalPressureMpa",
    label: "Номинальное давление",
    unit: "МПа",
    step: 0.1,
    minParam: "minNominalPressure",
    maxParam: "maxNominalPressure",
  },
];

type CatalogFiltersProps = {
  categories: CatalogCategory[];
  filterRanges: CatalogProductFilterRanges;
  initialPage: CatalogProductsPage;
  queryString: string;
  settings: CatalogSettings;
};

function toNumber(value: string | null): number {
  return value === null ? 0 : Number(value);
}

function createInitialRanges(
  filterRanges: CatalogProductFilterRanges,
): Record<RangeKey, RangeValue> {
  return Object.fromEntries(
    rangeConfigs.map((config) => [
      config.key,
      { min: toNumber(filterRanges[config.key].min), max: toNumber(filterRanges[config.key].max) },
    ]),
  ) as Record<RangeKey, RangeValue>;
}

function createRangesFromFilters(
  initialRanges: Record<RangeKey, RangeValue>,
  filters: CatalogProductFilters,
): Record<RangeKey, RangeValue> {
  return Object.fromEntries(
    rangeConfigs.map((config) => {
      const bounds = initialRanges[config.key];
      const minValue = filters[config.minParam];
      const maxValue = filters[config.maxParam];
      const min =
        minValue !== undefined ? Math.min(Math.max(minValue, bounds.min), bounds.max) : bounds.min;
      const max =
        maxValue !== undefined ? Math.max(Math.min(maxValue, bounds.max), bounds.min) : bounds.max;
      return [config.key, { min: Math.min(min, max), max: Math.max(min, max) }];
    }),
  ) as Record<RangeKey, RangeValue>;
}

type RangeFilterProps = {
  config: RangeConfig;
  bounds: RangeValue;
  value: RangeValue;
  onChange: (value: RangeValue) => void;
};

function RangeFilter({ config, bounds, value, onChange }: RangeFilterProps) {
  const updateMin = (nextMin: number) =>
    onChange({ min: Math.min(Math.max(nextMin, bounds.min), value.max), max: value.max });
  const updateMax = (nextMax: number) =>
    onChange({ min: value.min, max: Math.max(Math.min(nextMax, bounds.max), value.min) });
  const parseInput = (nextValue: string, fallback: number) => {
    const parsed = Number(nextValue);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const rangeLength = bounds.max - bounds.min || 1;
  const start = ((value.min - bounds.min) / rangeLength) * 100;
  const end = 100 - ((value.max - bounds.min) / rangeLength) * 100;

  return (
    <section className="pt-6">
      <h3 className="text-sm font-black text-slate-950">
        {config.label}, {config.unit}
      </h3>
      <div className="relative mt-2 h-6">
        <div className="absolute top-2.5 h-1 w-full rounded-full bg-slate-200" />
        <div
          className="absolute top-2.5 h-1 rounded-full bg-brand"
          style={{ left: `${start}%`, right: `${end}%` }}
        />
        <input
          aria-label={`${config.label}, минимальное значение`}
          type="range"
          min={bounds.min}
          max={bounds.max}
          step={config.step}
          value={value.min}
          onChange={(event) => updateMin(Number(event.target.value))}
          className="catalog-range absolute inset-0 h-6 w-full"
        />
        <input
          aria-label={`${config.label}, максимальное значение`}
          type="range"
          min={bounds.min}
          max={bounds.max}
          step={config.step}
          value={value.max}
          onChange={(event) => updateMax(Number(event.target.value))}
          className="catalog-range absolute inset-0 h-6 w-full"
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label
          className="grid gap-1 text-xs font-medium text-slate-500"
          htmlFor={`${config.key}-min`}
        >
          От
          <input
            id={`${config.key}-min`}
            type="number"
            inputMode="decimal"
            min={bounds.min}
            max={bounds.max}
            step={config.step}
            value={value.min}
            onChange={(event) => updateMin(parseInput(event.target.value, value.min))}
            className="h-10 min-w-0 border border-slate-300 px-2 text-sm font-medium text-slate-950 outline-none transition-colors duration-200 ease-out focus:border-brand"
          />
        </label>
        <label
          className="grid gap-1 text-xs font-medium text-slate-500"
          htmlFor={`${config.key}-max`}
        >
          До
          <input
            id={`${config.key}-max`}
            type="number"
            inputMode="decimal"
            min={bounds.min}
            max={bounds.max}
            step={config.step}
            value={value.max}
            onChange={(event) => updateMax(parseInput(event.target.value, value.max))}
            className="h-10 min-w-0 border border-slate-300 px-2 text-sm font-medium text-slate-950 outline-none transition-colors duration-200 ease-out focus:border-brand"
          />
        </label>
      </div>
    </section>
  );
}

type FiltersPanelProps = {
  categories: CatalogCategory[];
  initialRanges: Record<RangeKey, RangeValue>;
  ranges: Record<RangeKey, RangeValue>;
  search: string;
  selectedCategories: string[];
  onSearchChange: (value: string) => void;
  onToggleCategory: (category: string) => void;
  onRangeChange: (key: RangeKey, value: RangeValue) => void;
  onReset: () => void;
  onClose?: () => void;
  settings: CatalogSettings;
};

function FiltersPanel({
  categories,
  initialRanges,
  ranges,
  search,
  selectedCategories,
  onSearchChange,
  onToggleCategory,
  onRangeChange,
  onReset,
  onClose,
  settings,
}: FiltersPanelProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-black text-slate-950">Фильтры</h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onReset}
            className="cursor-pointer text-sm font-bold text-brand transition-colors duration-200 ease-out hover:text-brand-dark focus-visible:outline-2 focus-visible:outline-brand"
          >
            Сбросить
          </button>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="grid size-9 cursor-pointer place-items-center rounded-sm text-slate-500 transition-colors duration-200 ease-out hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-brand"
              aria-label="Закрыть фильтры"
            >
              <IconX className="size-5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
      <label className="mt-5 grid gap-1.5 text-sm font-black text-slate-950">
        Поиск
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          type="search"
          placeholder="Название или артикул"
          className="h-11 border border-slate-300 px-3 text-sm font-medium outline-none transition-colors duration-200 ease-out focus:border-brand"
        />
      </label>
      <section className="mt-6">
        <h3 className="text-sm font-black text-slate-950">Категории</h3>
        <div className="relative mt-4">
          <div className="grid max-h-56 gap-3 overflow-y-auto pb-7 pr-2">
            {categories.map((category) => (
              <label
                key={category.slug}
                className="flex cursor-pointer items-start gap-3 text-sm leading-5 text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(category.slug)}
                  onChange={() => onToggleCategory(category.slug)}
                  className="mt-0.5 h-4 w-4 accent-brand"
                />
                <span>
                  {category.name} <span className="text-slate-500">({category.productCount})</span>
                </span>
              </label>
            ))}
          </div>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-linear-to-t from-white to-transparent"
          />
        </div>
      </section>
      {rangeConfigs
        .filter((config) => settings.showPrices || config.key !== "price")
        .map((config) => (
          <RangeFilter
            key={config.key}
            config={config}
            bounds={initialRanges[config.key]}
            value={ranges[config.key]}
            onChange={(value) => onRangeChange(config.key, value)}
          />
        ))}
    </>
  );
}

export function CatalogFilters({
  categories,
  filterRanges,
  initialPage,
  queryString,
  settings,
}: CatalogFiltersProps) {
  const router = useRouter();
  const initialRanges = useMemo(() => createInitialRanges(filterRanges), [filterRanges]);
  const initialFilters = useMemo(() => parseCatalogFilterParams(queryString), [queryString]);
  const [search, setSearch] = useState(initialFilters.search ?? "");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    initialFilters.category?.split(",") ?? [],
  );
  const [ranges, setRanges] = useState(() =>
    createRangesFromFilters(initialRanges, initialFilters),
  );
  const [productsPage, setProductsPage] = useState(initialPage);
  const [products, setProducts] = useState(initialPage.items);
  const [isLoading, setIsLoading] = useState(false);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [isMobileFiltersClosing, setIsMobileFiltersClosing] = useState(false);
  const [error, setError] = useState("");
  const [isFilterNavigationPending, startFilterNavigation] = useTransition();
  const hasMounted = useRef(false);
  const latestRequestId = useRef(0);
  const mobileFiltersRef = useRef<HTMLElement>(null);

  const buildFilters = useCallback(
    (page: number): CatalogProductFilters => {
      const filters: CatalogProductFilters = {
        page,
        pageSize: CATALOG_PAGE_SIZE,
        search: search.trim() || undefined,
        category: selectedCategories.join(",") || undefined,
      };
      for (const config of rangeConfigs) {
        const range = ranges[config.key];
        const bounds = initialRanges[config.key];
        if (range.min !== bounds.min) filters[config.minParam] = range.min;
        if (range.max !== bounds.max) filters[config.maxParam] = range.max;
      }
      return filters;
    },
    [initialRanges, ranges, search, selectedCategories],
  );

  const loadMoreProducts = useCallback(
    async (page: number, signal?: AbortSignal) => {
      const requestId = ++latestRequestId.current;
      setIsLoading(true);
      setError("");
      try {
        const { data: nextPage } = await browserApi.GET("/catalog/products/page", {
          params: { query: catalogPageQuery(buildFilters(page)) },
          signal,
          fetch: timedFetch(10_000),
        });
        if (!nextPage) throw new Error("Не удалось загрузить товары.");
        if (requestId !== latestRequestId.current) return;
        setProductsPage(nextPage);
        setProducts((current) => [...current, ...nextPage.items]);
        // The loaded page count goes into the URL without a server round trip,
        // so «Назад» from a product renders the same list.
        window.history.replaceState(null, "", catalogPageHref(queryString, nextPage.page));
        return true;
      } catch (loadError) {
        if (isRequestAbort(loadError) || requestId !== latestRequestId.current) return;
        setError(
          isRequestTimeout(loadError)
            ? "Сервер не ответил вовремя. Попробуйте обновить каталог."
            : loadError instanceof Error
              ? loadError.message
              : "Не удалось загрузить товары.",
        );
      } finally {
        if (requestId === latestRequestId.current) setIsLoading(false);
      }
      return false;
    },
    [buildFilters, queryString],
  );

  // «Назад» from a product: Next may render the list from its client cache,
  // which only has the first page, while the URL says `?page=N`. Load the
  // missing pages, then return to the saved scroll position (WEB-04).
  const restoredLoadedPages = useRef(false);
  useEffect(() => {
    if (restoredLoadedPages.current) return;
    restoredLoadedPages.current = true;
    const savedScroll = takeSavedCatalogScroll();
    const requested = Math.min(
      parseCatalogPageParam(window.location.search),
      productsPage.totalPages,
    );
    void (async () => {
      for (let page = productsPage.page + 1; page <= requested; page += 1)
        if (!(await loadMoreProducts(page))) return;
      if (savedScroll !== null)
        window.requestAnimationFrame(() => window.scrollTo({ top: savedScroll }));
    })();
  }, [loadMoreProducts, productsPage.page, productsPage.totalPages]);
  useEffect(() => rememberCatalogScroll(), []);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    const nextQueryString = serializeCatalogFilterParams(buildFilters(1));
    if (nextQueryString === queryString) return;
    const timeout = window.setTimeout(() => {
      startFilterNavigation(() => {
        router.replace(`/catalog${nextQueryString ? `?${nextQueryString}` : ""}`, {
          scroll: false,
        });
      });
    }, 350);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [buildFilters, queryString, router]);

  const closeMobileFilters = () => {
    if (isMobileFiltersClosing) return;

    setIsMobileFiltersClosing(true);
    window.setTimeout(() => {
      setIsMobileFiltersOpen(false);
      setIsMobileFiltersClosing(false);
    }, 220);
  };

  useModalAccessibility(mobileFiltersRef, closeMobileFilters, isMobileFiltersOpen);

  const toggleCategory = (category: string) =>
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
  const resetFilters = () => {
    setSearch("");
    setSelectedCategories([]);
    setRanges(initialRanges);
  };
  const isUpdating = isLoading || isFilterNavigationPending;
  const isEmpty = !isUpdating && !error && products.length === 0;
  const hasActiveFilters = serializeCatalogFilterParams(buildFilters(1)) !== "";
  const requestedComment = isEmpty
    ? customOrderComment({
        search,
        categories: categories
          .filter((category) => selectedCategories.includes(category.slug))
          .map((category) => category.name),
        ranges: rangeConfigs
          .filter((config) => config.key !== "price")
          .map((config) => ({
            label: config.label,
            unit: config.unit,
            ...ranges[config.key],
            boundsMin: initialRanges[config.key].min,
            boundsMax: initialRanges[config.key].max,
          })),
      })
    : "";
  const updateRange = (key: RangeKey, value: RangeValue) =>
    setRanges((current) => ({ ...current, [key]: value }));
  const filtersPanelProps: FiltersPanelProps = {
    categories,
    initialRanges,
    ranges,
    search,
    selectedCategories,
    onSearchChange: setSearch,
    onToggleCategory: toggleCategory,
    onRangeChange: updateRange,
    onReset: resetFilters,
    settings,
  };

  return (
    <section className="bg-slate-100 py-8 sm:py-12 lg:py-16">
      <div className="mx-auto max-w-360 px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-8">
          <aside className="hidden h-fit border border-slate-200 bg-white p-5 lg:block">
            <FiltersPanel {...filtersPanelProps} />
          </aside>
          <div className="min-w-0">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Каталог</p>
                <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                  Все гидроцилиндры
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-4 sm:flex-col sm:items-end sm:gap-3">
                <a
                  href={OZON_URL}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Купить товары Гидравлика 25 на Ozon — открыть в новой вкладке"
                  className="inline-flex rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
                >
                  <OzonBuyBadge className="h-16 w-auto" />
                </a>
                <p className="text-sm text-slate-600">Найдено: {productsPage.total}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsMobileFiltersOpen(true)}
              className="mt-5 inline-flex min-h-11 w-full cursor-pointer items-center justify-center border border-brand bg-white px-4 text-sm font-bold text-brand transition-colors duration-200 ease-out hover:bg-brand hover:text-white focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand lg:hidden"
            >
              Фильтры{selectedCategories.length > 0 ? `: ${selectedCategories.length}` : ""}
            </button>
            {error ? (
              <p
                role="alert"
                className="mt-6 border-l-2 border-brand bg-white p-4 text-sm text-slate-700"
              >
                {error}
              </p>
            ) : null}
            <div className="mt-6 grid gap-4 sm:mt-8 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => (
                <ProductCard key={product.slug} product={product} />
              ))}
            </div>
            {isEmpty ? (
              <div className="mt-6 border border-slate-200 bg-white p-6 sm:mt-8 sm:p-8">
                <h2 className="text-xl font-black text-slate-950">
                  Подходящих гидроцилиндров не нашлось
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                  {hasActiveFilters
                    ? "Измените или сбросьте фильтры. Если нужного размера нет в каталоге, изготовим гидроцилиндр по вашим параметрам."
                    : "Сейчас в каталоге нет товаров. Оставьте заявку — изготовим гидроцилиндр по вашим параметрам."}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  {hasActiveFilters ? (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="inline-flex min-h-12 cursor-pointer items-center justify-center border border-brand bg-white px-5 text-sm font-bold text-brand transition-colors duration-200 ease-out hover:bg-brand hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
                    >
                      Сбросить фильтры
                    </button>
                  ) : null}
                  <CustomProductionRequestModal
                    buttonLabel="Заказать изготовление"
                    triggerClassName="bg-brand px-5 text-white hover:bg-brand-dark"
                    initialComment={requestedComment}
                  />
                </div>
              </div>
            ) : null}
            {isUpdating && products.length > 0 ? (
              <div className="mt-6 flex justify-center">
                <LoadingSpinner label="Обновляем каталог" />
              </div>
            ) : null}
            {productsPage.page < productsPage.totalPages ? (
              <div className="mt-8 text-center">
                {/* A real link, so crawlers reach every page; a click loads the next page in place. */}
                <a
                  href={catalogPageHref(queryString, productsPage.page + 1)}
                  aria-disabled={isUpdating || undefined}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    if (!isUpdating) void loadMoreProducts(productsPage.page + 1);
                  }}
                  className="inline-flex min-h-12 cursor-pointer items-center border border-brand bg-white px-6 text-sm font-bold text-brand transition-colors duration-200 ease-out hover:bg-brand hover:text-white aria-disabled:cursor-not-allowed aria-disabled:border-slate-300 aria-disabled:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand"
                >
                  {isLoading ? "Загрузка…" : "Показать ещё"}
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {isMobileFiltersOpen ? (
        <div
          className={`${isMobileFiltersClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"} fixed inset-0 z-[60] bg-slate-950/35 lg:hidden`}
          role="presentation"
          onMouseDown={closeMobileFilters}
        >
          <aside
            ref={mobileFiltersRef}
            role="dialog"
            aria-modal="true"
            aria-label="Фильтры каталога"
            tabIndex={-1}
            className={`${isMobileFiltersClosing ? "modal-dialog-exit" : "modal-dialog-enter"} absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t bg-white p-5 outline-none`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <FiltersPanel {...filtersPanelProps} onClose={closeMobileFilters} />
          </aside>
        </div>
      ) : null}
    </section>
  );
}

const catalogScrollKey = "catalog-scroll";
const catalogScrollLifetimeMs = 30 * 60_000;

/** Remembers the scroll position of this catalog URL until the page is left. */
function rememberCatalogScroll() {
  const currentUrl = () => window.location.pathname + window.location.search;
  // Read on scroll: when the cleanup runs, the location already shows the product.
  let url = currentUrl();
  let y = window.scrollY;
  const track = () => {
    url = currentUrl();
    y = window.scrollY;
  };
  window.addEventListener("scroll", track, { passive: true });
  return () => {
    window.removeEventListener("scroll", track);
    try {
      sessionStorage.setItem(catalogScrollKey, JSON.stringify({ url, y, savedAt: Date.now() }));
    } catch {
      // Storage may be unavailable (private mode): the list still works, only the position is lost.
    }
  };
}

/** The position saved for this URL (removed once read), e.g. after «Назад». */
function takeSavedCatalogScroll(): number | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(catalogScrollKey) ?? "null") as {
      url?: string;
      y?: number;
      savedAt?: number;
    } | null;
    sessionStorage.removeItem(catalogScrollKey);
    const url = window.location.pathname + window.location.search;
    return saved?.url === url &&
      typeof saved.y === "number" &&
      Date.now() - (saved.savedAt ?? 0) < catalogScrollLifetimeMs
      ? saved.y
      : null;
  } catch {
    // Unreadable or unavailable storage: stay at the current position.
    return null;
  }
}
