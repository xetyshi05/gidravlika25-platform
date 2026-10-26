"use client";

import {
  IconAdjustmentsHorizontal,
  IconArrowsSort,
  IconChevronLeft,
  IconChevronRight,
  IconColumns3,
  IconMaximize,
  IconMinimize,
  IconRefresh,
  IconRestore,
  IconTableRow,
  IconGripVertical,
} from "@tabler/icons-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Checkbox, CustomSelect } from "@/components/ui";
import { TableColumnResizer } from "@/components/table-column-resizer";

export type TableColumn = { id: string; label: string };

type TableControlsProps = {
  columns: TableColumn[];
  visible: string[];
  onVisibleChange: (value: string[]) => void;
  dense: boolean;
  onDenseChange: (value: boolean) => void;
  fullscreen: boolean;
  onFullscreenChange: (value: boolean) => void;
  filtersVisible: boolean;
  onFiltersVisibleChange: (value: boolean) => void;
  onReset: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  primaryAction?: ReactNode;
  primaryActionTooltip?: string;
};

export function TableControls({
  columns,
  visible,
  onVisibleChange,
  dense,
  onDenseChange,
  fullscreen,
  onFullscreenChange,
  filtersVisible,
  onFiltersVisibleChange,
  onReset,
  onRefresh,
  isRefreshing = false,
  primaryAction,
  primaryActionTooltip,
}: TableControlsProps) {
  const [open, setOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const orderedColumns = [
    ...visible
      .map((id) => columns.find((column) => column.id === id))
      .filter((column): column is TableColumn => Boolean(column)),
    ...columns.filter((column) => !visible.includes(column.id)),
  ];
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <>
      <TableColumnResizer storageKey={columns.map((column) => column.id).join("-")} />
      <div ref={ref} className="flex items-center gap-3">
        <div className="relative flex items-center rounded-md border border-line bg-field shadow-sm">
          {onRefresh && (
            <ToolbarButton
              title="Обновить данные"
              onClick={onRefresh}
              className="border-r border-line"
            >
              <IconRefresh className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </ToolbarButton>
          )}
          <ToolbarButton
            title="Сбросить настройки таблицы"
            onClick={onReset}
            className="border-r border-line"
          >
            <IconRestore className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Показать или скрыть фильтры"
            onClick={() => onFiltersVisibleChange(!filtersVisible)}
            active={filtersVisible}
            className="border-r border-line"
          >
            <IconAdjustmentsHorizontal className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Плотность строк"
            onClick={() => onDenseChange(!dense)}
            active={dense}
            className="border-r border-line"
          >
            <IconTableRow className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Полный экран"
            onClick={() => onFullscreenChange(!fullscreen)}
            active={fullscreen}
            className="border-r border-line"
          >
            {fullscreen ? <IconMinimize className="size-4" /> : <IconMaximize className="size-4" />}
          </ToolbarButton>
          <ToolbarButton title="Видимые столбцы" onClick={() => setOpen(!open)} active={open}>
            <IconColumns3 className="size-4" />
          </ToolbarButton>
          {open && (
            <div className="absolute right-0 top-11 z-50 w-60 rounded-md border border-line bg-surface p-2 shadow-xl">
              <p className="px-2 py-1.5 text-xs text-copy-faint">
                Столбцы — перетащите для изменения порядка
              </p>
              {orderedColumns.map((column) => (
                <div
                  key={column.id}
                  draggable={visible.includes(column.id)}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", column.id);
                    setDraggingId(column.id);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const sourceId = event.dataTransfer.getData("text/plain") || draggingId;
                    if (!sourceId || sourceId === column.id) {
                      setDraggingId(null);
                      return;
                    }
                    const next = visible.filter((id) => id !== sourceId);
                    const targetIndex = next.indexOf(column.id);
                    if (targetIndex >= 0)
                      onVisibleChange([
                        ...next.slice(0, targetIndex),
                        sourceId,
                        ...next.slice(targetIndex),
                      ]);
                    setDraggingId(null);
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  className={`flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-surface-raised ${draggingId === column.id ? "opacity-40" : ""}`}
                >
                  <IconGripVertical className="size-4 shrink-0 text-copy-faint" />
                  <Checkbox
                    ariaLabel={`Показать столбец «${column.label}»`}
                    checked={visible.includes(column.id)}
                    disabled={visible.length === 1 && visible.includes(column.id)}
                    onCheckedChange={(checked) =>
                      onVisibleChange(
                        checked
                          ? [...visible, column.id]
                          : visible.filter((item) => item !== column.id),
                      )
                    }
                  />
                  {column.label}
                </div>
              ))}
            </div>
          )}
        </div>
        {primaryAction && (
          <span
            data-tooltip={primaryActionTooltip}
            className={
              "inline-flex [&>button]:rounded-md " + (primaryActionTooltip ? "bo-tooltip" : "")
            }
          >
            {primaryAction}
          </span>
        )}
      </div>
    </>
  );
}

function ToolbarButton({
  children,
  title,
  onClick,
  active = false,
  className = "",
}: {
  children: ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-tooltip={title}
      aria-label={title}
      onClick={onClick}
      className={`bo-tooltip grid size-9 place-items-center text-copy-muted hover:bg-surface-raised hover:text-brand ${active ? "bg-brand-soft text-brand" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

export function SortTitle({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Сортировать по столбцу «${label}». ${active ? `Сейчас: ${direction === "asc" ? "по возрастанию" : "по убыванию"}` : "Сортировка не выбрана"}`}
      className={`inline-flex items-center gap-1 text-left text-xs font-medium ${active ? "text-copy" : "text-copy-faint hover:text-copy-muted"}`}
    >
      {label}
      <IconArrowsSort
        aria-hidden
        className={`size-3.5 ${active ? "text-brand" : ""} ${active && direction === "desc" ? "rotate-180" : ""}`}
      />
    </button>
  );
}

export function TableLoadingBar({ loading }: { loading: boolean }) {
  const [visible, setVisible] = useState(loading);
  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(loading), loading ? 0 : 600);
    return () => window.clearTimeout(timeout);
  }, [loading]);
  if (!visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 top-0 z-30 h-1.5 overflow-hidden"
    >
      <span className="sr-only">Загрузка таблицы</span>
      <div
        aria-hidden
        className="h-full w-2/5 bg-brand shadow-[0_0_12px_#d1010c] animate-[table-progress_1s_ease-in-out_infinite]"
      />
    </div>
  );
}

export function TableLoadingRows({ columns, rows = 6 }: { columns: number; rows?: number }) {
  return Array.from({ length: rows }, (_, index) => (
    <tr key={index} aria-hidden="true" className="animate-pulse border-t border-line">
      <td colSpan={columns} className="px-4 py-3">
        <div className="flex items-center gap-5">
          <span className="size-5 shrink-0 rounded-sm bg-surface-raised" />
          <span className="h-3 w-24 rounded-sm bg-surface-raised" />
          <span className="h-3 w-2/5 rounded-sm bg-surface-raised" />
          <span className="ml-auto h-6 w-20 rounded-sm bg-field" />
        </div>
      </td>
    </tr>
  ));
}

export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="relative z-20 flex flex-wrap items-center justify-end gap-3 border-x border-b border-line bg-field px-4 py-3 text-sm text-copy-muted">
      <span className="ml-auto">Строк на странице</span>
      <div className="w-20">
        <CustomSelect
          ariaLabel="Строк на странице"
          value={String(pageSize)}
          onChange={(value) => onPageSizeChange(Number(value))}
          options={[
            { value: "10", label: "10" },
            { value: "25", label: "25" },
            { value: "50", label: "50" },
          ]}
        />
      </div>
      <span className="tabular-nums">
        {from}–{to} из {total}
      </span>
      <div className="flex overflow-hidden rounded-md border border-line">
        <button
          type="button"
          aria-label="Предыдущая страница"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          className="grid size-9 place-items-center border-r border-line hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-35"
        >
          <IconChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Следующая страница"
          disabled={page === pageCount}
          onClick={() => onPageChange(page + 1)}
          className="grid size-9 place-items-center hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-35"
        >
          <IconChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
