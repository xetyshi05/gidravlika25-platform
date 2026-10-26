"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { TableEmptyState } from "@/components/table-empty-state";
import { formatDateTime } from "@/lib/request-format";
import type { CustomerRequest } from "@/types/customers";
import { requestStatusLabels, requestTypeLabels } from "@/types/requests";

type SortColumn = "number" | "type" | "status" | "createdAt";

export function CustomerRequestsTable({ requests }: { requests: CustomerRequest[] }) {
  const router = useRouter();
  const [sortBy, setSortBy] = useState<SortColumn>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const sortedRequests = useMemo(
    () =>
      [...requests].sort((left, right) => {
        const value =
          sortBy === "type"
            ? requestTypeLabels[left.type].localeCompare(requestTypeLabels[right.type], "ru")
            : sortBy === "status"
              ? requestStatusLabels[left.status].localeCompare(
                  requestStatusLabels[right.status],
                  "ru",
                )
              : sortBy === "number"
                ? Number(left.number) - Number(right.number)
                : new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        return sortOrder === "asc" ? value : -value;
      }),
    [requests, sortBy, sortOrder],
  );
  const toggleSort = (column: SortColumn) => {
    if (column === sortBy) setSortOrder((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSortBy(column);
      setSortOrder(column === "createdAt" ? "desc" : "asc");
    }
  };
  const openRequest = (id: string) => router.push(`/requests/${id}`);

  return (
    <div className="mt-4 overflow-x-auto border border-slate-200 bg-white">
      <table className="min-w-[760px] w-full border-collapse text-left text-sm">
        <caption className="sr-only">История заявок клиента</caption>
        <thead className="bg-slate-50 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
          <tr>
            <SortHeader
              label="Номер"
              column="number"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={toggleSort}
            />
            <SortHeader
              label="Тип"
              column="type"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={toggleSort}
            />
            <SortHeader
              label="Статус"
              column="status"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={toggleSort}
            />
            <SortHeader
              label="Создана"
              column="createdAt"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={toggleSort}
            />
          </tr>
        </thead>
        <tbody>
          {sortedRequests.map((request) => (
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
              className="cursor-pointer border-t border-slate-200 transition-colors duration-200 ease-out hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
            >
              <td className="px-5 py-4 text-slate-950">№ {request.number}</td>
              <td className="px-5 py-4 text-slate-700">{requestTypeLabels[request.type]}</td>
              <td className="px-5 py-4">
                <StatusBadge status={request.status} />
              </td>
              <td className="px-5 py-4 text-slate-500">{formatDateTime(request.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {requests.length === 0 ? (
        <TableEmptyState
          title="Заявок у клиента пока нет"
          description="История обращений появится после создания первой заявки."
        />
      ) : null}
    </div>
  );
}

function SortHeader({
  label,
  column,
  sortBy,
  sortOrder,
  onSort,
}: {
  label: string;
  column: SortColumn;
  sortBy: SortColumn;
  sortOrder: "asc" | "desc";
  onSort: (column: SortColumn) => void;
}) {
  const active = sortBy === column;
  return (
    <th
      scope="col"
      aria-sort={active ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
      className="p-0"
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        aria-label={`Сортировать по столбцу «${label}». ${active ? `Сейчас: ${sortOrder === "asc" ? "по возрастанию" : "по убыванию"}` : "Сортировка не выбрана"}`}
        className="flex w-full items-center gap-2 px-5 py-4 text-left transition-colors hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
      >
        {label}
        <span
          aria-hidden
          className={`text-sm leading-none ${active ? "text-brand" : "text-slate-300"}`}
        >
          {active && sortOrder === "asc" ? "↑" : "↓"}
        </span>
      </button>
    </th>
  );
}
