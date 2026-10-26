import Link from "next/link";
import type { Pagination, RequestHistoryPages } from "@/types/requests";

export function RequestHistoryPagination({
  requestId,
  pagination,
  pages,
  pageParam,
  keepDialogOpen = false,
}: {
  requestId: string;
  pagination: Pagination;
  pages: RequestHistoryPages;
  pageParam: keyof RequestHistoryPages;
  keepDialogOpen?: boolean;
}) {
  if (pagination.totalPages <= 1) return null;

  return (
    <nav
      aria-label="Навигация по истории"
      className="mt-5 flex items-center justify-between gap-3 border-t border-slate-200 pt-4"
    >
      <PaginationLink
        href={historyHref(requestId, pages, pageParam, pagination.page - 1, keepDialogOpen)}
        disabled={pagination.page <= 1}
      >
        Назад
      </PaginationLink>
      <span className="text-xs font-bold text-slate-500">
        {pagination.page} из {pagination.totalPages}
      </span>
      <PaginationLink
        href={historyHref(requestId, pages, pageParam, pagination.page + 1, keepDialogOpen)}
        disabled={pagination.page >= pagination.totalPages}
      >
        Далее
      </PaginationLink>
    </nav>
  );
}

function PaginationLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: string;
}) {
  const classes =
    "inline-flex min-h-9 items-center border border-slate-300 px-3 text-xs font-bold outline-none transition-colors";
  return disabled ? (
    <span aria-disabled="true" className={`${classes} cursor-not-allowed text-slate-300`}>
      {children}
    </span>
  ) : (
    <Link
      href={href}
      scroll={false}
      className={`${classes} text-slate-700 hover:border-brand hover:text-brand focus-visible:ring-2 focus-visible:ring-brand`}
    >
      {children}
    </Link>
  );
}

function historyHref(
  requestId: string,
  pages: RequestHistoryPages,
  pageParam: keyof RequestHistoryPages,
  page: number,
  keepDialogOpen: boolean,
) {
  const query = new URLSearchParams();
  const nextPages = { ...pages, [pageParam]: page };
  for (const [key, value] of Object.entries(nextPages)) {
    if (value > 1) query.set(key, String(value));
  }
  if (keepDialogOpen) query.set("personalData", "open");
  const suffix = query.size ? `?${query.toString()}` : "";
  return `/requests/${requestId}${suffix}`;
}
