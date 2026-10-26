"use client";

import { IconPlus } from "@tabler/icons-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  bulkUpdateProducts,
  deleteProducts,
  getCategories,
  getProductIds,
  getProductsPage,
  type ProductTableFilter,
} from "@/lib/backoffice-api";
import { AvailabilityBadge, Checkbox, EmptyState, StatusBadge } from "@/components/ui";
import { AdvancedFilter } from "@/components/table-filters";
import { TableColumnResizer } from "@/components/table-column-resizer";
import {
  SortTitle,
  TableControls,
  TableLoadingBar,
  TableLoadingRows,
  TablePagination,
  type TableColumn,
} from "@/components/table-controls";
import { ProductModal } from "@/components/product-form";
import { ProductImage } from "@/components/product-image";
import { ProductBulkActions } from "@/components/product-bulk-actions";
import { useConfirmation } from "@/components/confirmation-dialog";
import { filtersForAttention, productsEmptyState } from "@/components/products-table-state";
import type { Category, Product } from "@/data/catalog";

const columns: TableColumn[] = [
  { id: "image", label: "Изображение" },
  { id: "sku", label: "Артикул" },
  { id: "name", label: "Название" },
  { id: "category", label: "Категория" },
  { id: "price", label: "Цена" },
  { id: "active", label: "Статус" },
  { id: "stock", label: "Наличие" },
];
const defaults = columns.map(({ id }) => id);
type SortKey = "sku" | "name" | "category" | "price" | "active" | "stock";
type Sort = { id: SortKey; dir: "asc" | "desc" };
type StoredState = {
  visible?: string[];
  dense?: boolean;
  filtersVisible?: boolean;
  sort?: Sort;
  pageSize?: number;
  filters?: ProductTableFilter[];
};
const readStoredState = (): StoredState => {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem("bo-products-table") ?? "{}") as StoredState;
  } catch {
    localStorage.removeItem("bo-products-table");
    return {};
  }
};

export function ProductsTable() {
  const confirm = useConfirmation();
  const searchParams = useSearchParams();
  const attention = searchParams.get("attention");
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [visible, setVisible] = useState(defaults);
  const [dense, setDense] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [filters, setFilters] = useState<ProductTableFilter[]>([]);
  const [sort, setSort] = useState<Sort>({ id: "name", dir: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<Product | null | undefined>(undefined);
  const [hydrated, setHydrated] = useState(false);
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const result = await getProductsPage({
        page: page - 1,
        pageSize,
        sortBy: sort.id,
        sortDir: sort.dir,
        filters,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить товары.");
    } finally {
      setIsLoading(false);
    }
  }, [filters, page, pageSize, sort]);
  useEffect(() => {
    const stored = readStoredState();
    queueMicrotask(() => {
      setVisible(stored.visible?.filter((id) => defaults.includes(id)) || defaults);
      setDense(stored.dense ?? true);
      setFiltersVisible(stored.filtersVisible ?? true);
      setFilters(Array.isArray(stored.filters) ? stored.filters : []);
      setSort(stored.sort ?? { id: "name", dir: "asc" });
      setPageSize(stored.pageSize ?? 25);
      setHydrated(true);
    });
    void getCategories().then(setCategories);
  }, []);
  useEffect(() => {
    if (hydrated) queueMicrotask(() => void refresh());
  }, [hydrated, refresh]);
  useEffect(() => {
    if (!hydrated) return;
    const attentionFilters = filtersForAttention(attention);
    if (!attentionFilters) return;
    queueMicrotask(() => {
      setFilters(attentionFilters);
      setFiltersVisible(true);
      setPage(1);
    });
  }, [attention, hydrated]);
  useEffect(() => {
    if (hydrated)
      localStorage.setItem(
        "bo-products-table",
        JSON.stringify({
          visible,
          dense,
          filtersVisible,
          sort,
          pageSize,
          filters,
        } satisfies StoredState),
      );
  }, [hydrated, visible, dense, filtersVisible, sort, pageSize, filters]);
  const categoryOptions = useMemo(
    () => categories.map((category) => ({ value: category.id, label: category.name })),
    [categories],
  );
  const visibleColumns = visible
    .map((id) => columns.find((column) => column.id === id))
    .filter((column): column is TableColumn => Boolean(column));
  const emptyState = productsEmptyState(filters.length);
  const allPageSelected = items.length > 0 && items.every((item) => selected.includes(item.id));
  const setFilter = (id: string, filter?: ProductTableFilter) => {
    setFilters((current) =>
      filter
        ? [...current.filter((item) => item.id !== id), filter]
        : current.filter((item) => item.id !== id),
    );
    setPage(1);
  };
  const toggleSort = (id: SortKey) => {
    setSort((current) =>
      current.id === id ? { id, dir: current.dir === "asc" ? "desc" : "asc" } : { id, dir: "asc" },
    );
    setPage(1);
  };
  const togglePage = (checked: boolean) =>
    setSelected((current) =>
      checked
        ? [...new Set([...current, ...items.map((item) => item.id)])]
        : current.filter((id) => !items.some((item) => item.id === id)),
    );
  const clearFilters = () => {
    setFilters([]);
    setPage(1);
  };
  const selectAllFiltered = async () => {
    try {
      const result = await getProductIds(filters);
      setSelected(result.ids);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось выбрать результаты фильтра.");
    }
  };
  const updateBulk = async (
    values: { isActive?: boolean; isFeatured?: boolean; categoryId?: string },
    notice: string,
  ) => {
    if (!selected.length) return;
    try {
      await bulkUpdateProducts(selected, values);
      setSelected([]);
      window.dispatchEvent(new CustomEvent("backoffice:notice", { detail: notice }));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось обновить выбранные товары.");
    }
  };
  const remove = async () => {
    if (
      !selected.length ||
      !(await confirm({
        title: `Удалить товаров: ${selected.length}?`,
        description: "Товары будут удалены без возможности восстановления.",
        confirmLabel: "Удалить",
      }))
    )
      return;
    try {
      await deleteProducts(selected);
      setSelected([]);
      await refresh();
      window.dispatchEvent(new CustomEvent("backoffice:notice", { detail: "Товары удалены" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось удалить товары.");
    }
  };
  const reset = () => {
    setVisible(defaults);
    setDense(true);
    setFiltersVisible(true);
    clearFilters();
    setSort({ id: "name", dir: "asc" });
    setPageSize(25);
  };
  return (
    <div
      className={fullscreen ? "fixed inset-0 z-40 overflow-auto bg-canvas p-5 sm:p-8" : "space-y-4"}
    >
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-3">
        {selected.length > 0 ? (
          <ProductBulkActions
            selectedCount={selected.length}
            total={total}
            entityName="товарами"
            onSelectAll={selectAllFiltered}
            onClear={() => setSelected([])}
            onActivate={() => updateBulk({ isActive: true }, "Товары активированы")}
            onDeactivate={() => updateBulk({ isActive: false }, "Товары деактивированы")}
            onDelete={remove}
          />
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-copy-faint">
              {isLoading && items.length === 0 ? "Загрузка товаров…" : `${total} товаров`}
            </span>
            {filters.length > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs text-brand hover:text-brand-dark"
              >
                Сбросить фильтры ({filters.length})
              </button>
            )}
          </div>
        )}
        <TableControls
          columns={columns}
          visible={visible}
          onVisibleChange={setVisible}
          dense={dense}
          onDenseChange={setDense}
          fullscreen={fullscreen}
          onFullscreenChange={setFullscreen}
          filtersVisible={filtersVisible}
          onFiltersVisibleChange={setFiltersVisible}
          onReset={reset}
          onRefresh={() => void refresh()}
          isRefreshing={isLoading}
          primaryActionTooltip="Добавить товар"
          primaryAction={
            <button
              type="button"
              onClick={() => setEditor(null)}
              aria-label="Добавить товар"
              className="grid size-9 place-items-center bg-brand text-white hover:bg-brand-dark"
            >
              <IconPlus className="size-4" />
            </button>
          }
        />
      </div>
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="border-l-2 border-brand bg-brand-soft/40 px-4 py-3 text-sm text-copy"
        >
          {error}
        </div>
      )}
      <TableColumnResizer storageKey="products" />
      <div className="relative overflow-x-auto rounded-t-md border border-line bg-surface">
        <TableLoadingBar loading={isLoading} />
        <table aria-busy={isLoading} className="w-full min-w-240 text-left text-sm">
          <caption className="sr-only">Товары каталога</caption>
          <thead className="bg-field text-xs text-copy-faint">
            <tr>
              <th scope="col" className="w-12 px-4 py-3">
                <span className="sr-only">Выбор</span>
                <Checkbox
                  ariaLabel="Выбрать товары на странице"
                  checked={allPageSelected}
                  onCheckedChange={togglePage}
                />
              </th>
              {visibleColumns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={
                    column.id !== "image"
                      ? sort.id === column.id
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                      : undefined
                  }
                  className="px-4 py-3 font-normal"
                >
                  {column.id === "image" ? (
                    column.label
                  ) : (
                    <SortTitle
                      label={column.label}
                      active={sort.id === column.id}
                      direction={sort.dir}
                      onClick={() => toggleSort(column.id as SortKey)}
                    />
                  )}
                </th>
              ))}
            </tr>
            {filtersVisible && (
              <tr aria-label="Фильтры таблицы" className="border-t border-line">
                <th className="px-4 py-2" />
                {visibleColumns.map((column) => (
                  <th key={column.id} className="px-2 py-2 font-normal">
                    <ColumnFilter
                      column={column.id}
                      filter={filters.find((filter) => filter.id === column.id)}
                      onChange={(filter) => setFilter(column.id, filter)}
                      categoryOptions={categoryOptions}
                    />
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-line">
            {isLoading && items.length === 0 ? (
              <TableLoadingRows columns={visibleColumns.length + 1} />
            ) : null}
            {items.map((product) => (
              <tr
                key={product.id}
                onClick={() => setEditor(product)}
                className={`cursor-pointer transition-colors hover:bg-surface-raised ${dense ? "text-xs" : ""}`}
              >
                <td
                  className={`px-4 ${dense ? "py-2" : "py-3"}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <Checkbox
                    ariaLabel={`Выбрать ${product.name}`}
                    checked={selected.includes(product.id)}
                    onCheckedChange={() =>
                      setSelected((current) =>
                        current.includes(product.id)
                          ? current.filter((id) => id !== product.id)
                          : [...current, product.id],
                      )
                    }
                  />
                </td>
                {visibleColumns.map((column) => (
                  <ProductCell
                    key={column.id}
                    column={column.id}
                    product={product}
                    dense={dense}
                    onOpen={() => setEditor(product)}
                  />
                ))}
              </tr>
            ))}
            {items.length === 0 && !isLoading && !error && (
              <tr>
                <td colSpan={visibleColumns.length + 1}>
                  <EmptyState
                    title={emptyState.title}
                    description={emptyState.description}
                    action={
                      emptyState.canResetFilters ? (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="h-9 rounded-md bg-brand px-4 text-sm text-white hover:bg-brand-dark"
                        >
                          Сбросить фильтры
                        </button>
                      ) : undefined
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!isLoading || items.length > 0 ? (
        <TablePagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      ) : null}
      {editor !== undefined && (
        <ProductModal
          product={editor ?? undefined}
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            setEditor(undefined);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function ColumnFilter({
  column,
  filter,
  onChange,
  categoryOptions,
}: {
  column: string;
  filter?: ProductTableFilter;
  onChange: (filter?: ProductTableFilter) => void;
  categoryOptions: { value: string; label: string }[];
}) {
  if (column === "image")
    return (
      <AdvancedFilter
        id="image"
        ariaLabel="Фильтр по изображению"
        filter={filter}
        onChange={onChange}
        kind="select"
        options={[
          { value: "with", label: "С изображением" },
          { value: "none", label: "Без изображения" },
        ]}
      />
    );
  if (column === "category")
    return (
      <AdvancedFilter
        id="category"
        ariaLabel="Фильтр по категории"
        filter={filter}
        onChange={onChange}
        kind="select"
        options={categoryOptions}
      />
    );
  if (column === "active")
    return (
      <AdvancedFilter
        id="active"
        ariaLabel="Фильтр по статусу"
        filter={filter}
        onChange={onChange}
        kind="select"
        options={[
          { value: "true", label: "Активные" },
          { value: "false", label: "Неактивные" },
        ]}
      />
    );
  if (column === "stock")
    return (
      <AdvancedFilter
        id="stock"
        ariaLabel="Фильтр по наличию"
        filter={filter}
        onChange={onChange}
        kind="select"
        options={[
          { value: "available", label: "В наличии" },
          { value: "low", label: "Мало" },
          { value: "none", label: "Нет в наличии" },
        ]}
      />
    );
  return (
    <AdvancedFilter
      id={column}
      ariaLabel={`Фильтр по ${column === "price" ? "цене" : column === "sku" ? "артикулу" : "названию"}`}
      filter={filter}
      onChange={onChange}
      kind={column === "price" ? "number" : "text"}
    />
  );
}
function ProductCell({
  column,
  product,
  dense,
  onOpen,
}: {
  column: string;
  product: Product;
  dense: boolean;
  onOpen: () => void;
}) {
  const padding = `px-4 ${dense ? "py-2" : "py-3"}`;
  if (column === "image")
    return (
      <td className={padding}>
        <div
          className={`grid place-items-center rounded-md border border-slate-300 bg-slate-100 p-1 ${dense ? "size-10" : "size-16"}`}
        >
          <ProductImage
            src={product.imagePath}
            alt={product.name}
            width={dense ? 40 : 64}
            height={dense ? 40 : 64}
            compact
            className="size-full object-contain"
          />
        </div>
      </td>
    );
  if (column === "sku") return <td className={`${padding} text-copy-muted`}>{product.sku}</td>;
  if (column === "name")
    return (
      <td className={padding}>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          aria-label={`Открыть товар «${product.name}»`}
          className="text-left font-medium hover:text-brand focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {product.name}
        </button>
      </td>
    );
  if (column === "category")
    return <td className={`${padding} text-copy-muted`}>{product.category.name}</td>;
  if (column === "price")
    return (
      <td className={`${padding} tabular-nums`}>
        {Number(product.price).toLocaleString("ru-RU")} ₽
      </td>
    );
  if (column === "active")
    return (
      <td className={padding}>
        <StatusBadge active={product.isActive} />
      </td>
    );
  return (
    <td className={padding}>
      <AvailabilityBadge stock={product.stockQuantity} />
    </td>
  );
}
