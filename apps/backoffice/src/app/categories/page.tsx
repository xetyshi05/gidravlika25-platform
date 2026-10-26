"use client";

import { IconPlus, IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Checkbox,
  CustomSelect,
  EmptyState,
  PageHeader,
  StatusBadge,
  Switch,
} from "@/components/ui";
import {
  SortTitle,
  TableControls,
  TableLoadingBar,
  TableLoadingRows,
  TablePagination,
  type TableColumn,
} from "@/components/table-controls";
import {
  deleteCategories,
  bulkUpdateCategories,
  getCategoryIds,
  getCategoriesPage,
  createCategory,
  updateCategory,
} from "@/lib/backoffice-api";
import { ProductBulkActions } from "@/components/product-bulk-actions";
import { useConfirmation } from "@/components/confirmation-dialog";
import type { Category } from "@/data/catalog";
import { useModalAccessibility } from "@/lib/use-modal-accessibility";

const columns: TableColumn[] = [
  { id: "name", label: "Название" },
  { id: "productCount", label: "Товаров" },
  { id: "active", label: "Статус" },
];
const defaultColumns = columns.map((column) => column.id);
type SortKey = "name" | "productCount" | "active";

export default function Categories() {
  const confirm = useConfirmation();
  const [items, setItems] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [editor, setEditor] = useState<Category | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [filters, setFilters] = useState<Partial<Record<SortKey, string>>>({});
  const [sort, setSort] = useState<{ id: SortKey; dir: "asc" | "desc" }>({
    id: "name",
    dir: "asc",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(defaultColumns);
  const [dense, setDense] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getCategoriesPage({
        page: page - 1,
        pageSize,
        sortBy: sort.id,
        sortDir: sort.dir,
        filters,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить категории.");
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize, sort]);

  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  const visibleColumns = useMemo(
    () =>
      visible
        .map((id) => columns.find((column) => column.id === id))
        .filter((column): column is TableColumn => Boolean(column)),
    [visible],
  );
  const allPageSelected = items.length > 0 && items.every((item) => selected.includes(item.id));
  const selectPage = (checked: boolean) =>
    setSelected((current) =>
      checked
        ? [...new Set([...current, ...items.map((item) => item.id)])]
        : current.filter((id) => !items.some((item) => item.id === id)),
    );
  const toggleSort = (id: SortKey) => {
    setSort((current) =>
      current.id === id ? { id, dir: current.dir === "asc" ? "desc" : "asc" } : { id, dir: "asc" },
    );
    setPage(1);
  };
  const open = (item?: Category) => {
    setEditor(item ?? null);
    setName(item?.name ?? "");
    setActive(item?.isActive ?? true);
  };
  const save = async () => {
    if (!name.trim()) return;
    try {
      // The dialog edits only the name and status: slug, description and parent are not sent,
      // so the server keeps them (a rename must not change public URLs or the tree).
      if (editor) await updateCategory(editor.id, { name: name.trim(), isActive: active });
      else
        await createCategory({
          name: name.trim(),
          slug: name
            .toLowerCase()
            .replace(/[^a-zа-яё0-9]+/gi, "-")
            .replace(/^-|-$/g, ""),
          isActive: active,
        });
      setEditor(undefined);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить категорию.");
    }
  };
  const remove = async () => {
    if (
      !selected.length ||
      !(await confirm({
        title: `Удалить категорий: ${selected.length}?`,
        description: "Категории будут удалены без возможности восстановления.",
        confirmLabel: "Удалить",
      }))
    )
      return;
    try {
      await deleteCategories(selected);
      setSelected([]);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось удалить категории.");
    }
  };
  const updateSelected = async (isActive: boolean) => {
    if (!selected.length) return;
    try {
      await bulkUpdateCategories(selected, isActive);
      setSelected([]);
      await refresh();
      window.dispatchEvent(
        new CustomEvent("backoffice:notice", {
          detail: isActive ? "Категории активированы" : "Категории деактивированы",
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось обновить категории.");
    }
  };
  const selectAllFiltered = async () => {
    try {
      setSelected((await getCategoryIds(filters)).ids);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось выбрать результаты.");
    }
  };
  const reset = () => {
    setVisible(defaultColumns);
    setDense(true);
    setFiltersVisible(true);
    setFilters({});
    setSort({ id: "name", dir: "asc" });
    setPageSize(25);
    setPage(1);
  };

  return (
    <main>
      <PageHeader title="Категории" />
      <div
        className={
          fullscreen
            ? "fixed inset-0 z-40 overflow-auto bg-canvas p-5 sm:p-8"
            : "space-y-4 px-5 py-6 sm:px-8 lg:px-10"
        }
      >
        <div className="flex min-h-10 flex-wrap items-center justify-between gap-3">
          {selected.length ? (
            <ProductBulkActions
              selectedCount={selected.length}
              total={total}
              entityName="категориями"
              onSelectAll={selectAllFiltered}
              onClear={() => setSelected([])}
              onActivate={() => updateSelected(true)}
              onDeactivate={() => updateSelected(false)}
              onDelete={remove}
            />
          ) : (
            <span className="text-sm text-copy-faint">
              {loading && items.length === 0 ? "Загрузка категорий…" : `${total} категорий`}
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
            primaryActionTooltip="Добавить категорию"
            primaryAction={
              <button
                type="button"
                onClick={() => open()}
                aria-label="Добавить категорию"
                className="grid size-9 place-items-center bg-brand text-white hover:bg-brand-dark"
              >
                <IconPlus className="size-4" />
              </button>
            }
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
          <table aria-busy={loading} className="w-full min-w-160 text-left text-sm">
            <caption className="sr-only">Категории каталога</caption>
            <thead className="bg-field text-xs text-copy-faint">
              <tr>
                <th scope="col" className="w-12 px-4 py-3">
                  <span className="sr-only">Выбор</span>
                  <Checkbox
                    ariaLabel="Выбрать категории на странице"
                    checked={allPageSelected}
                    onCheckedChange={selectPage}
                  />
                </th>
                {visibleColumns.map((column) => (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={
                      sort.id === column.id
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className="px-4 py-3 font-normal"
                  >
                    <SortTitle
                      label={column.label}
                      active={sort.id === column.id}
                      direction={sort.dir}
                      onClick={() => toggleSort(column.id as SortKey)}
                    />
                  </th>
                ))}
              </tr>
              {filtersVisible && (
                <tr aria-label="Фильтры таблицы" className="border-t border-line">
                  <th />
                  {visibleColumns.map((column) => (
                    <th key={column.id} className="p-2">
                      {column.id === "name" ? (
                        <input
                          aria-label="Фильтр по названию"
                          value={filters.name ?? ""}
                          onChange={(event) => {
                            setFilters((current) => ({ ...current, name: event.target.value }));
                            setPage(1);
                          }}
                          placeholder="Фильтр..."
                          className="h-8 w-full rounded border border-line bg-canvas px-2 text-xs"
                        />
                      ) : column.id === "productCount" ? (
                        <input
                          aria-label="Фильтр по количеству товаров"
                          value={filters.productCount ?? ""}
                          onChange={(event) => {
                            setFilters((current) => ({
                              ...current,
                              productCount: event.target.value,
                            }));
                            setPage(1);
                          }}
                          type="number"
                          min="0"
                          step="1"
                          placeholder="Точно"
                          className="h-8 w-full rounded border border-line bg-canvas px-2 text-xs"
                        />
                      ) : column.id === "active" ? (
                        <CustomSelect
                          ariaLabel="Фильтр по статусу"
                          value={filters.active ?? ""}
                          onChange={(value) => {
                            setFilters((current) => ({ ...current, active: value }));
                            setPage(1);
                          }}
                          options={[
                            { value: "", label: "Все" },
                            { value: "true", label: "Активные" },
                            { value: "false", label: "Неактивные" },
                          ]}
                          size="compact"
                        />
                      ) : null}
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
                <tr
                  key={item.id}
                  onClick={() => open(item)}
                  className={"cursor-pointer hover:bg-surface-raised " + (dense ? "text-xs" : "")}
                >
                  <td
                    className={"px-4 " + (dense ? "py-2" : "py-3")}
                    onClick={(event) => event.stopPropagation()}
                  >
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
                    <CategoryCell
                      key={column.id}
                      column={column.id}
                      item={item}
                      dense={dense}
                      onOpen={() => open(item)}
                    />
                  ))}
                </tr>
              ))}
              {!items.length && !loading && !error && (
                <tr>
                  <td colSpan={visibleColumns.length + 1}>
                    <EmptyState
                      title="Категории не найдены"
                      description="Измените фильтр или добавьте категорию."
                    />
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
      {editor !== undefined && (
        <CategoryDialog
          isEditing={Boolean(editor?.id)}
          name={name}
          active={active}
          onNameChange={setName}
          onActiveChange={setActive}
          onClose={() => setEditor(undefined)}
          onSave={() => void save()}
        />
      )}
    </main>
  );
}

function CategoryDialog({
  isEditing,
  name,
  active,
  onNameChange,
  onActiveChange,
  onClose,
  onSave,
}: {
  isEditing: boolean;
  name: string;
  active: boolean;
  onNameChange: (value: string) => void;
  onActiveChange: (value: boolean) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(dialogRef, onClose);
  return (
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 bo-modal-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-dialog-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-md border border-line bg-surface p-5 outline-none bo-modal-card"
      >
        <div className="mb-5 flex justify-between">
          <h2 id="category-dialog-title">
            {isEditing ? "Редактирование категории" : "Новая категория"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Закрыть">
            <IconX className="size-5" />
          </button>
        </div>
        <label className="grid gap-2 text-sm text-copy-muted">
          Название
          <input
            data-modal-initial-focus
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            required
            className="h-10 w-full rounded border border-line bg-field px-3 text-copy"
          />
        </label>
        <div className="mt-4">
          <span className="mb-2 block text-sm text-copy-muted">Активна</span>
          <div className="flex h-10 items-center">
            <Switch
              ariaLabel="Категория активна"
              checked={active}
              onCheckedChange={onActiveChange}
            />
          </div>
        </div>
        <button
          type="button"
          disabled={!name.trim()}
          onClick={onSave}
          className="mt-5 h-10 rounded-md bg-brand px-4 text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Сохранить
        </button>
      </div>
    </div>
  );
}

function CategoryCell({
  column,
  item,
  dense,
  onOpen,
}: {
  column: string;
  item: Category;
  dense: boolean;
  onOpen: () => void;
}) {
  const className = "px-4 " + (dense ? "py-2" : "py-3");
  if (column === "name")
    return (
      <td className={className}>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          aria-label={`Открыть категорию «${item.name}»`}
          className="text-left font-medium hover:text-brand focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {item.name}
        </button>
      </td>
    );
  if (column === "productCount") return <td className={className}>{item.productCount}</td>;
  return (
    <td className={className}>
      <StatusBadge active={item.isActive} />
    </td>
  );
}
