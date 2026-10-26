"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { RequestAttention } from "@/components/request-attention";
import { TableEmptyState } from "@/components/table-empty-state";
import { formatDateTime, fullName } from "@/lib/request-format";
import { requestStatusLabels, requestTypeLabels, type RequestsPage } from "@/types/requests";

type SortColumn = "number" | "customer" | "type" | "createdAt" | "status";

export function RecentRequestsTable({ recent }: { recent: RequestsPage }) {
  const router = useRouter();
  const [sortBy, setSortBy] = useState<SortColumn>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const sortedRequests = useMemo(
    () =>
      [...recent.data].sort((left, right) => {
        const value =
          sortBy === "number"
            ? Number(left.number) - Number(right.number)
            : sortBy === "customer"
              ? fullName(left).localeCompare(fullName(right), "ru")
              : sortBy === "type"
                ? requestTypeLabels[left.type].localeCompare(requestTypeLabels[right.type], "ru")
                : sortBy === "status"
                  ? requestStatusLabels[left.status].localeCompare(
                      requestStatusLabels[right.status],
                      "ru",
                    )
                  : new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        return sortOrder === "asc" ? value : -value;
      }),
    [recent.data, sortBy, sortOrder],
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
    <div className="overflow-x-auto">
      <table className="min-w-[700px] w-full border-collapse text-left text-sm">
        <caption className="sr-only">Последние заявки</caption>
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
              label="Клиент"
              column="customer"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={toggleSort}
            />
            <SortHeader
              label="Направление"
              column="type"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={toggleSort}
            />
            <SortHeader
              label="Дата"
              column="createdAt"
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
              <td className="px-5 py-4 text-slate-700">{requestTypeLabels[request.type]}</td>
              <td className="px-5 py-4 text-slate-500">
                {formatDateTime(request.createdAt)}
                <RequestAttention request={request} showAge={false} />
              </td>
              <td className="px-5 py-4">
                <StatusBadge status={request.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {recent.data.length === 0 ? (
        <TableEmptyState
          title="Заявок пока нет"
          description="Новые обращения появятся здесь после отправки формы на сайте."
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
