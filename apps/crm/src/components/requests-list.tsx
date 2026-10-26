"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "@/components/icons";
import { RefreshButton } from "@/components/refresh-button";
import { RequestAttention } from "@/components/request-attention";
import { StatusBadge } from "@/components/status-badge";
import { TableEmptyState } from "@/components/table-empty-state";
import type { RequestListFilters, RequestSortColumn } from "@/lib/request-list-filters";
import { formatDateTime, fullName } from "@/lib/request-format";
import {
  requestStatuses,
  requestStatusLabels,
  requestTypeLabels,
  type RequestsPage,
} from "@/types/requests";

export function RequestsList({
  result,
  filters,
  path,
  showDirection = false,
}: {
  result: RequestsPage;
  filters: RequestListFilters;
  path: string;
  showDirection?: boolean;
}) {
  const router = useRouter();
  const searchTimeout = useRef<number | undefined>(undefined);
  const makeHref = useCallback(
    (changes: Partial<RequestListFilters> = {}) => {
      const values = { ...filters, ...changes };
      const query = new URLSearchParams({
        page: String(values.page),
        sortBy: values.sortBy,
        sortOrder: values.sortOrder,
      });
      if (values.search) query.set("search", values.search);
      if (values.status) query.set("status", values.status);
      if (values.attention) query.set("attention", values.attention);
      return `${path}?${query.toString()}`;
    },
    [filters, path],
  );
  const navigate = useCallback(
    (changes: Partial<RequestListFilters>) => router.replace(makeHref(changes)),
    [makeHref, router],
  );

  useEffect(() => () => window.clearTimeout(searchTimeout.current), []);

  const toggleSort = (sortBy: RequestSortColumn) =>
    navigate({
      sortBy,
      sortOrder: filters.sortBy === sortBy && filters.sortOrder === "asc" ? "desc" : "asc",
      page: 1,
    });
  const openRequest = (id: string) => router.push(`/requests/${id}`);
  const hasFilters = Boolean(filters.search || filters.status || filters.attention);

  return (
    <section className="mt-8">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const search = new FormData(event.currentTarget).get("search")?.toString().trim() ?? "";
          navigate({ search, page: 1 });
        }}
        className="flex flex-col gap-3 border border-slate-200 bg-white p-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <label className="flex h-11 w-full max-w-md items-center gap-3 border border-slate-300 px-3 text-slate-500 transition-colors duration-200 ease-out focus-within:border-brand">
          <span className="sr-only">Поиск заявок</span>
          <SearchIcon className="size-5 shrink-0" />
          <input
            defaultValue={filters.search}
            name="search"
            onChange={(event) => {
              window.clearTimeout(searchTimeout.current);
              const search = event.currentTarget.value.trim();
              searchTimeout.current = window.setTimeout(() => {
                if (search !== filters.search) navigate({ search, page: 1 });
              }, 450);
            }}
            type="search"
            placeholder="Номер, имя, телефон или компания"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-slate-950 outline-none"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <AttentionFilter
            value={filters.attention}
            onChange={(attention) =>
              navigate({
                attention,
                status: attention === "overdue" ? "" : filters.status,
                page: 1,
              })
            }
          />
          <StatusFilter
            value={filters.status}
            onChange={(status) =>
              navigate({
                status,
                attention: status ? "" : filters.attention,
                page: 1,
              })
            }
          />
          <RefreshButton />
        </div>
      </form>

      <div className="mt-4 overflow-x-auto border border-slate-200 bg-white">
        <table
          className={`${showDirection ? "min-w-[760px]" : "min-w-[900px]"} w-full border-collapse text-left text-sm`}
        >
          <caption className="sr-only">
            {showDirection ? "Все заявки" : "Заявки выбранного направления"}
          </caption>
          <thead className="bg-slate-50 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <SortHeader label="Номер" column="number" filters={filters} onSort={toggleSort} />
              <SortHeader label="Клиент" column="customer" filters={filters} onSort={toggleSort} />
              {showDirection ? (
                <SortHeader
                  label="Направление"
                  column="type"
                  filters={filters}
                  onSort={toggleSort}
                />
              ) : (
                <>
                  <SortHeader
                    label="Телефон"
                    column="phone"
                    filters={filters}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    label="Компания"
                    column="company"
                    filters={filters}
                    onSort={toggleSort}
                  />
                </>
              )}
              <SortHeader
                label={showDirection ? "Дата" : "Создана"}
                column="createdAt"
                filters={filters}
                onSort={toggleSort}
              />
              <SortHeader label="Статус" column="status" filters={filters} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {result.data.map((request) => (
              <tr
                key={request.id}
                tabIndex={0}
                role="link"
                onClick={() => openRequest(request.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openRequest(request.id);
                  }
                }}
                className={`cursor-pointer border-t border-slate-200 transition-colors duration-200 ease-out hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none ${request.isUnread ? "bg-red-50/40" : ""}`}
              >
                <td className={`px-5 py-4 text-slate-950 ${request.isUnread ? "font-black" : ""}`}>
                  <span className="inline-flex items-center gap-2">
                    {request.isUnread ? (
                      <span
                        role="img"
                        aria-label="Непрочитанная заявка"
                        className="size-2 rounded-full bg-brand"
                      />
                    ) : null}
                    № {request.number}
                  </span>
                </td>
                <td className={`px-5 py-4 text-slate-950 ${request.isUnread ? "font-bold" : ""}`}>
                  {fullName(request)}
                </td>
                {showDirection ? (
                  <td className="px-5 py-4 text-slate-700">{requestTypeLabels[request.type]}</td>
                ) : (
                  <>
                    <td className="px-5 py-4 text-slate-700">{request.phone}</td>
                    <td className="px-5 py-4 text-slate-700">{request.company ?? "—"}</td>
                  </>
                )}
                <td className="px-5 py-4 text-slate-500">
                  <span>{formatDateTime(request.createdAt)}</span>
                  <RequestAttention request={request} showAge={false} />
                </td>
                <td className="px-5 py-4">
                  <StatusBadge status={request.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.data.length === 0 ? (
          <TableEmptyState
            title={hasFilters ? "Заявки не найдены" : "Заявок пока нет"}
            description={
              hasFilters
                ? "Измените строку поиска или выбранные фильтры."
                : "Новые обращения появятся здесь после отправки формы на сайте."
            }
          />
        ) : null}
      </div>
      <Pagination filters={filters} pagination={result.pagination} path={path} />
    </section>
  );
}

function AttentionFilter({
  value,
  onChange,
}: {
  value: RequestListFilters["attention"];
  onChange: (value: RequestListFilters["attention"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const options: Array<{
    value: RequestListFilters["attention"];
    label: string;
  }> = [
    { value: "", label: "Все заявки" },
    { value: "unread", label: "Непрочитанные" },
    { value: "overdue", label: "SLA просрочен" },
  ];
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const label = options[selectedIndex].label;

  const focusOption = (index: number) => {
    const nextIndex = (index + options.length) % options.length;
    optionRefs.current[nextIndex]?.focus();
  };

  const openAndFocus = (index: number) => {
    setOpen(true);
    window.requestAnimationFrame(() => focusOption(index));
  };

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  return (
    <div ref={root} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="request-attention-filter-listbox"
        aria-label={`Контроль заявок: ${label}`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openAndFocus(event.key === "ArrowDown" ? selectedIndex : selectedIndex - 1);
          }
        }}
        className="flex h-11 min-w-48 items-center justify-between gap-4 border border-slate-300 bg-white px-3 text-sm font-medium text-slate-950 outline-none transition-colors duration-200 hover:border-brand focus-visible:border-brand"
      >
        <span>{label}</span>
        <ChevronDownIcon
          aria-hidden
          className={`size-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div
          id="request-attention-filter-listbox"
          role="listbox"
          aria-label="Контроль заявок"
          className="absolute left-0 z-20 mt-2 min-w-56 overflow-hidden border border-slate-200 bg-white py-1 shadow-xl shadow-slate-950/10"
        >
          {options.map((option, index) => (
            <StatusOption
              key={option.value || "all"}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              label={option.label}
              selected={value === option.value}
              onKeyDown={(event) =>
                handleOptionKeyDown(event, index, options.length, focusOption, () => {
                  setOpen(false);
                  trigger.current?.focus();
                })
              }
              onSelect={() => {
                onChange(option.value);
                setOpen(false);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StatusFilter({
  value,
  onChange,
}: {
  value: RequestListFilters["status"];
  onChange: (status: RequestListFilters["status"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const optionValues: Array<RequestListFilters["status"]> = ["", ...requestStatuses];
  const selectedIndex = Math.max(0, optionValues.indexOf(value));

  const focusOption = (index: number) => {
    const nextIndex = (index + optionValues.length) % optionValues.length;
    optionRefs.current[nextIndex]?.focus();
  };

  const openAndFocus = (index: number) => {
    setOpen(true);
    window.requestAnimationFrame(() => focusOption(index));
  };

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, []);
  const label = value ? requestStatusLabels[value] : "Все статусы";
  return (
    <div ref={root} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="request-status-filter-listbox"
        aria-label={`Фильтр по статусу: ${label}`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openAndFocus(event.key === "ArrowDown" ? selectedIndex : selectedIndex - 1);
          }
        }}
        className="flex h-11 min-w-48 items-center justify-between gap-4 border border-slate-300 bg-white px-3 text-sm font-medium text-slate-950 outline-none transition-colors duration-200 hover:border-brand focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20"
      >
        <span>{label}</span>
        <ChevronDownIcon
          aria-hidden
          className={`size-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div
          id="request-status-filter-listbox"
          role="listbox"
          aria-label="Фильтр по статусу"
          className="absolute right-0 z-20 mt-2 min-w-56 overflow-hidden border border-slate-200 bg-white py-1 shadow-xl shadow-slate-950/10"
        >
          <StatusOption
            ref={(node) => {
              optionRefs.current[0] = node;
            }}
            label="Все статусы"
            selected={!value}
            onKeyDown={(event) =>
              handleOptionKeyDown(event, 0, optionValues.length, focusOption, () => {
                setOpen(false);
                trigger.current?.focus();
              })
            }
            onSelect={() => {
              onChange("");
              setOpen(false);
            }}
          />
          {requestStatuses.map((status) => (
            <StatusOption
              key={status}
              ref={(node) => {
                optionRefs.current[requestStatuses.indexOf(status) + 1] = node;
              }}
              label={requestStatusLabels[status]}
              selected={value === status}
              onKeyDown={(event) => {
                const index = requestStatuses.indexOf(status) + 1;
                handleOptionKeyDown(event, index, optionValues.length, focusOption, () => {
                  setOpen(false);
                  trigger.current?.focus();
                });
              }}
              onSelect={() => {
                onChange(status);
                setOpen(false);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StatusOption({
  ref,
  label,
  selected,
  onSelect,
  onKeyDown,
}: {
  ref: (node: HTMLButtonElement | null) => void;
  label: string;
  selected: boolean;
  onSelect: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      ref={ref}
      role="option"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={`flex min-h-10 w-full items-center gap-2 border-l-2 px-3 text-left text-sm transition-colors focus-visible:bg-slate-50 focus-visible:text-slate-950 ${selected ? "border-brand bg-red-50 text-brand" : "border-transparent text-slate-700 hover:bg-slate-50 hover:text-slate-950"}`}
    >
      <span className="grid size-4 place-items-center">
        {selected ? <CheckIcon className="size-4" stroke={2.4} aria-hidden /> : null}
      </span>
      {label}
    </button>
  );
}

function handleOptionKeyDown(
  event: React.KeyboardEvent<HTMLButtonElement>,
  index: number,
  count: number,
  focusOption: (index: number) => void,
  close: () => void,
) {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    focusOption(index + (event.key === "ArrowDown" ? 1 : -1));
  } else if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    focusOption(event.key === "Home" ? 0 : count - 1);
  } else if (event.key === "Escape" || event.key === "Tab") {
    if (event.key === "Escape") event.preventDefault();
    close();
  }
}

function SortHeader({
  label,
  column,
  filters,
  onSort,
}: {
  label: string;
  column: RequestSortColumn;
  filters: RequestListFilters;
  onSort: (column: RequestSortColumn) => void;
}) {
  const active = filters.sortBy === column;
  return (
    <th
      scope="col"
      aria-sort={active ? (filters.sortOrder === "asc" ? "ascending" : "descending") : "none"}
      className="p-0"
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className="flex w-full items-center gap-2 px-5 py-4 text-left transition-colors hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
        aria-label={`Сортировать по столбцу «${label}». ${active ? `Сейчас: ${filters.sortOrder === "asc" ? "по возрастанию" : "по убыванию"}` : "Сортировка не выбрана"}`}
      >
        {label}
        <span
          aria-hidden
          className={`text-sm leading-none ${active ? "text-brand" : "text-slate-300"}`}
        >
          {active && filters.sortOrder === "asc" ? "↑" : "↓"}
        </span>
      </button>
    </th>
  );
}

function Pagination({
  filters,
  pagination,
  path,
}: {
  filters: RequestListFilters;
  pagination: RequestsPage["pagination"];
  path: string;
}) {
  if (pagination.totalPages <= 1)
    return pagination.total ? (
      <p className="mt-4 text-sm text-slate-500">Всего заявок: {pagination.total}</p>
    ) : null;
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500">
        Всего заявок: {pagination.total}. Страница {pagination.page} из {pagination.totalPages}
      </p>
      <div className="flex gap-2">
        <PaginationLink
          disabled={pagination.page === 1}
          filters={filters}
          page={pagination.page - 1}
          path={path}
        >
          Назад
        </PaginationLink>
        <PaginationLink
          disabled={pagination.page === pagination.totalPages}
          filters={filters}
          page={pagination.page + 1}
          path={path}
        >
          Вперёд
        </PaginationLink>
      </div>
    </div>
  );
}

function PaginationLink({
  children,
  disabled,
  filters,
  page,
  path,
}: {
  children: React.ReactNode;
  disabled: boolean;
  filters: RequestListFilters;
  page: number;
  path: string;
}) {
  const className =
    "inline-flex min-h-10 items-center border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition-colors hover:border-brand hover:text-brand";
  if (disabled)
    return (
      <span className={`${className} cursor-not-allowed border-slate-200 text-slate-400`}>
        {children}
      </span>
    );
  const query = new URLSearchParams({
    page: String(page),
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
  });
  if (filters.search) query.set("search", filters.search);
  if (filters.status) query.set("status", filters.status);
  if (filters.attention) query.set("attention", filters.attention);
  return (
    <Link href={`${path}?${query.toString()}`} className={className}>
      {children}
    </Link>
  );
}
