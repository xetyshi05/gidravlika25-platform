"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchIcon } from "@/components/icons";
import { RefreshButton } from "@/components/refresh-button";
import { TableEmptyState } from "@/components/table-empty-state";
import { formatDateTime, fullName } from "@/lib/request-format";
import type { CustomerListFilters, CustomerSortColumn } from "@/lib/customers";
import type { CustomersPage } from "@/types/customers";

export function CustomersTable({
  result,
  filters,
}: {
  result: CustomersPage;
  filters: CustomerListFilters;
}) {
  const router = useRouter();
  const searchTimeout = useRef<number | undefined>(undefined);
  const makeHref = useCallback(
    (changes: Partial<CustomerListFilters> = {}) => {
      const values = { ...filters, ...changes };
      const query = new URLSearchParams({
        page: String(values.page),
        sortBy: values.sortBy,
        sortOrder: values.sortOrder,
      });
      if (values.search) query.set("search", values.search);
      return `/clients?${query.toString()}`;
    },
    [filters],
  );
  const navigate = useCallback(
    (changes: Partial<CustomerListFilters>) => router.replace(makeHref(changes)),
    [makeHref, router],
  );
  useEffect(() => () => window.clearTimeout(searchTimeout.current), []);
  const toggleSort = (sortBy: CustomerSortColumn) =>
    navigate({
      sortBy,
      sortOrder: filters.sortBy === sortBy && filters.sortOrder === "asc" ? "desc" : "asc",
      page: 1,
    });
  const openCustomer = (id: string) => router.push(`/clients/${id}`);

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const search = new FormData(event.currentTarget).get("search")?.toString().trim() ?? "";
          navigate({ search, page: 1 });
        }}
        className="flex flex-col gap-3 border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <label className="flex h-11 w-full max-w-md items-center gap-3 border border-slate-300 px-3 text-slate-500 transition-colors duration-200 ease-out focus-within:border-brand">
          <span className="sr-only">Поиск клиентов</span>
          <SearchIcon aria-hidden className="size-5 shrink-0" />
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
            placeholder="Имя, телефон, email или компания — включая старые заявки"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-slate-950 outline-none"
          />
        </label>
        <RefreshButton />
      </form>
      <div className="mt-4 overflow-x-auto border border-slate-200 bg-white">
        <table className="min-w-[900px] w-full border-collapse text-left text-sm">
          <caption className="sr-only">Клиенты</caption>
          <thead className="bg-slate-50 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <SortHeader label="Клиент" column="name" filters={filters} onSort={toggleSort} />
              <SortHeader label="Компания" column="company" filters={filters} onSort={toggleSort} />
              <SortHeader label="Телефон" column="phone" filters={filters} onSort={toggleSort} />
              <SortHeader label="Email" column="email" filters={filters} onSort={toggleSort} />
              <SortHeader
                label="Заявок"
                column="requestCount"
                filters={filters}
                onSort={toggleSort}
              />
              <SortHeader
                label="Последняя активность"
                column="lastActivity"
                filters={filters}
                onSort={toggleSort}
              />
            </tr>
          </thead>
          <tbody>
            {result.data.map((customer) => (
              <tr
                key={customer.id}
                tabIndex={0}
                role="link"
                onClick={() => openCustomer(customer.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openCustomer(customer.id);
                  }
                }}
                className="cursor-pointer border-t border-slate-200 transition-colors duration-200 ease-out hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
              >
                <td className="px-5 py-4 text-slate-950">
                  <span>{fullName(customer)}</span>
                  {customer.anonymizedAt ? (
                    <span className="ml-2 whitespace-nowrap text-xs font-bold text-slate-500">
                      Обезличен
                    </span>
                  ) : null}
                </td>
                <td className="px-5 py-4 text-slate-700">{customer.company ?? "—"}</td>
                <td className="px-5 py-4 text-slate-700">{customer.phone}</td>
                <td className="px-5 py-4 text-slate-700">{customer.email ?? "—"}</td>
                <td className="px-5 py-4 text-slate-950">{customer.requestCount}</td>
                <td className="px-5 py-4 text-slate-500">
                  {customer.lastActivity ? formatDateTime(customer.lastActivity) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.data.length === 0 ? (
          <TableEmptyState
            title={filters.search ? "Клиенты не найдены" : "Клиентов пока нет"}
            description={
              filters.search
                ? "Попробуйте изменить поисковый запрос."
                : "Карточки клиентов появятся после создания первых заявок."
            }
          />
        ) : null}
      </div>
      <Pagination filters={filters} pagination={result.pagination} />
    </>
  );
}

function SortHeader({
  label,
  column,
  filters,
  onSort,
}: {
  label: string;
  column: CustomerSortColumn;
  filters: CustomerListFilters;
  onSort: (column: CustomerSortColumn) => void;
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
}: {
  filters: CustomerListFilters;
  pagination: CustomersPage["pagination"];
}) {
  if (pagination.totalPages <= 1)
    return pagination.total ? (
      <p className="mt-4 text-sm text-slate-500">Всего клиентов: {pagination.total}</p>
    ) : null;
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500">
        Всего клиентов: {pagination.total}. Страница {pagination.page} из {pagination.totalPages}
      </p>
      <div className="flex gap-2">
        <PageLink disabled={pagination.page === 1} filters={filters} page={pagination.page - 1}>
          Назад
        </PageLink>
        <PageLink
          disabled={pagination.page === pagination.totalPages}
          filters={filters}
          page={pagination.page + 1}
        >
          Вперёд
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({
  children,
  disabled,
  filters,
  page,
}: {
  children: React.ReactNode;
  disabled: boolean;
  filters: CustomerListFilters;
  page: number;
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
  return (
    <Link href={`/clients?${query.toString()}`} className={className}>
      {children}
    </Link>
  );
}
