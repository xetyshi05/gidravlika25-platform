"use client";

import { IconMinus, IconPlus } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  bulkStock,
  changeStock,
  getCategories,
  getProductIds,
  getProductsPage,
  type ProductTableFilter,
} from "@/lib/backoffice-api";
import { AvailabilityBadge, Checkbox, EmptyState, StatusBadge } from "@/components/ui";
import { AdvancedFilter } from "@/components/table-filters";
import {
  SortTitle,
  TableControls,
  TableLoadingBar,
  TableLoadingRows,
  TablePagination,
  type TableColumn,
} from "@/components/table-controls";
import { ProductBulkActions } from "@/components/product-bulk-actions";
import type { Category, Product } from "@/data/catalog";

const columns: TableColumn[] = [
  { id: "sku", label: "Артикул" },
  { id: "name", label: "Товар" },
  { id: "category", label: "Категория" },
  { id: "stock", label: "Остаток" },
  { id: "active", label: "Статус" },
  { id: "availability", label: "Наличие" },
  { id: "change", label: "Изменить" },
];
const defaultColumns = columns.map((column) => column.id);
type SortKey = "sku" | "name" | "category" | "stock" | "active";

export function StockTable() {
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [filters, setFilters] = useState<ProductTableFilter[]>([]);
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [sort, setSort] = useState<{ id: SortKey; dir: "asc" | "desc" }>({
    id: "stock",
    dir: "asc",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("1");
  const [visible, setVisible] = useState(defaultColumns);
  const [dense, setDense] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getProductsPage({
        page: page - 1,
        pageSize,
        sortBy: sort.id,
        sortDir: sort.dir,
        filters,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить остатки.");
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize, sort]);

  useEffect(() => {
    void getCategories().then(setCategories);
    queueMicrotask(() => void refresh());
    const timer = window.setInterval(() => void refresh(), 30000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const categoryOptions = useMemo(
    () => categories.map((item) => ({ value: item.id, label: item.name })),
    [categories],
  );
  const visibleColumns = useMemo(
    () =>
      visible
        .map((id) => columns.find((column) => column.id === id))
        .filter((column): column is TableColumn => Boolean(column)),
    [visible],
  );
  const pageSelected = items.length > 0 && items.every((item) => selected.includes(item.id));
  const setFilter = (id: string, filter?: ProductTableFilter) => {
    setFilters((current) =>
      filter
        ? [...current.filter((item) => item.id !== id), filter]
        : current.filter((item) => item.id !== id),
    );
    setPage(1);
  };
  const selectAll = async () => {
    try {
      setSelected((await getProductIds(filters)).ids);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось выбрать результаты.");
    }
  };
  const selectPage = (checked: boolean) =>
    setSelected((current) =>
      checked
        ? [...new Set([...current, ...items.map((item) => item.id)])]
        : current.filter((id) => !items.some((item) => item.id === id)),
    );
  const change = async (item: Product, delta: number) => {
    try {
      await changeStock(item.id, delta);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось изменить остаток.");
    }
  };
  const mass = async (direction: 1 | -1) => {
    const value = Number(amount);
    if (!selected.length || !Number.isInteger(value) || value < 1) return;
    try {
      await bulkStock(selected, direction * value);
      setSelected([]);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось обновить остатки.");
    }
  };
  const toggleSort = (id: SortKey) => {
    setSort((current) =>
      current.id === id ? { id, dir: current.dir === "asc" ? "desc" : "asc" } : { id, dir: "asc" },
    );
    setPage(1);
  };
  const reset = () => {
    setVisible(defaultColumns);
    setDense(true);
    setFiltersVisible(true);
    setFilters([]);
    setSort({ id: "stock", dir: "asc" });
    setPageSize(25);
    setPage(1);
  };

  return (
    <div
      className={fullscreen ? "fixed inset-0 z-40 overflow-auto bg-canvas p-5 sm:p-8" : "space-y-4"}
    >
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-3">
        {selected.length ? (
          <ProductBulkActions
            selectedCount={selected.length}
            total={total}
            entityName="остатками"
            actionLabel="Изменить количество"
            dialogTitle="Изменить количество"
            onSelectAll={selectAll}
            onClear={() => setSelected([])}
            additionalActions={
              <section className="rounded-md border border-line bg-field p-4">
                <p className="text-sm font-medium text-copy">На сколько изменить остаток?</p>
                <p className="mt-1 text-xs leading-5 text-copy-muted">
                  Укажите число, затем увеличьте или уменьшите остаток у всех выбранных товаров.
                </p>
                <div className="mt-4 grid grid-cols-[92px_1fr_1fr] gap-2">
                  <input
                    aria-label="Количество для массового изменения"
                    type="number"
                    min="1"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className="h-10 min-w-0 rounded-md border border-line bg-canvas px-3 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void mass(-1)}
                    className="inline-flex h-10 items-center justify-center gap-1 rounded-md border border-line px-2 text-sm text-copy-muted hover:border-brand hover:text-brand"
                  >
                    <IconMinus className="size-4" />
                    Списать
                  </button>
                  <button
                    type="button"
                    onClick={() => void mass(1)}
                    className="inline-flex h-10 items-center justify-center gap-1 rounded-md border border-line px-2 text-sm text-copy-muted hover:border-brand hover:text-brand"
                  >
                    <IconPlus className="size-4" />
                    Добавить
                  </button>
                </div>
              </section>
            }
          />
        ) : (
          <span className="text-sm text-copy-faint">
            {loading && items.length === 0 ? "Загрузка остатков…" : `${total} позиций`}
          </span>
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
          isRefreshing={loading}
        />
      </div>
      {error && (
        <p
          role="alert"
          aria-live="assertive"
          className="border-l-2 border-brand bg-brand-soft/40 px-4 py-3 text-sm"
        >
          {error}
        </p>
      )}
      <div className="relative overflow-x-auto rounded-t-md border border-line bg-surface">
        <TableLoadingBar loading={loading} />
        <table aria-busy={loading} className="w-full min-w-220 text-left text-sm">
          <caption className="sr-only">Остатки товаров</caption>
          <thead className="bg-field text-xs text-copy-faint">
            <tr>
              <th scope="col" className="w-12 px-4 py-3">
                <span className="sr-only">Выбор</span>
                <Checkbox
                  ariaLabel="Выбрать товары на странице"
                  checked={pageSelected}
                  onCheckedChange={selectPage}
                />
              </th>
              {visibleColumns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={
                    column.id !== "change" && column.id !== "availability"
                      ? sort.id === column.id
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                      : undefined
                  }
                  className="px-4 py-3 font-normal"
                >
                  {column.id === "change" || column.id === "availability" ? (
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
                <th />
                {visibleColumns.map((column) => (
                  <th key={column.id} className="p-2">
                    <StockFilter
                      column={column.id}
                      filter={filters.find(
                        (item) => item.id === (column.id === "stock" ? "quantity" : column.id),
                      )}
                      onChange={(filter) =>
                        setFilter(column.id === "stock" ? "quantity" : column.id, filter)
                      }
                      categoryOptions={categoryOptions}
                    />
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-line">
            {loading && items.length === 0 ? (
              <TableLoadingRows columns={visibleColumns.length + 1} />
            ) : null}
            {items.map((item) => (
              <tr key={item.id} className={"hover:bg-surface-raised " + (dense ? "text-xs" : "")}>
                <td className={"px-4 " + (dense ? "py-2" : "py-3")}>
                  <Checkbox
                    ariaLabel={"Выбрать " + item.name}
                    checked={selected.includes(item.id)}
                    onCheckedChange={() =>
                      setSelected((current) =>
                        current.includes(item.id)
                          ? current.filter((id) => id !== item.id)
                          : [...current, item.id],
                      )
                    }
                  />
                </td>
                {visibleColumns.map((column) => (
                  <StockCell
                    key={column.id}
                    column={column.id}
                    item={item}
                    dense={dense}
                    onChange={change}
                  />
                ))}
              </tr>
            ))}
            {!items.length && !loading && !error && (
              <tr>
                <td colSpan={visibleColumns.length + 1}>
                  <EmptyState title="На складе нет позиций" description="Измените фильтры." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!loading || items.length > 0 ? (
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
    </div>
  );
}

function StockFilter({
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
  if (column === "sku" || column === "name")
    return (
      <AdvancedFilter
        id={column}
        ariaLabel={"Фильтр по " + (column === "sku" ? "артикулу" : "названию")}
        filter={filter}
        onChange={onChange}
        kind="text"
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
  if (column === "stock")
    return (
      <AdvancedFilter
        id="quantity"
        ariaLabel="Фильтр по остатку"
        filter={filter}
        onChange={onChange}
        kind="number"
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
  if (column === "availability")
    return (
      <AdvancedFilter
        id="availability"
        ariaLabel="Фильтр по наличию"
        filter={filter}
        onChange={onChange}
        kind="select"
        options={[
          { value: "available", label: "В наличии" },
          { value: "low", label: "Мало" },
          { value: "none", label: "Нет" },
        ]}
      />
    );
  return null;
}

function StockCell({
  column,
  item,
  dense,
  onChange,
}: {
  column: string;
  item: Product;
  dense: boolean;
  onChange: (item: Product, delta: number) => Promise<void>;
}) {
  const className = "px-4 " + (dense ? "py-2" : "py-3");
  if (column === "sku") return <td className={className}>{item.sku}</td>;
  if (column === "name") return <td className={className + " font-medium"}>{item.name}</td>;
  if (column === "category") return <td className={className}>{item.category.name}</td>;
  if (column === "stock") return <td className={className}>{item.stockQuantity}</td>;
  if (column === "active")
    return (
      <td className={className}>
        <StatusBadge active={item.isActive} />
      </td>
    );
  if (column === "availability")
    return (
      <td className={className}>
        <AvailabilityBadge stock={item.stockQuantity} />
      </td>
    );
  return (
    <td className={className}>
      <button
        type="button"
        onClick={() => void onChange(item, -1)}
        className="mr-1 rounded border border-line p-1"
        aria-label={"Списать " + item.name}
      >
        <IconMinus className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => void onChange(item, 1)}
        className="rounded border border-line p-1"
        aria-label={"Добавить " + item.name}
      >
        <IconPlus className="size-4" />
      </button>
    </td>
  );
}
