import { requestStatuses, type RequestStatus } from "@/types/requests";

export const requestSortColumns = [
  "number",
  "customer",
  "type",
  "phone",
  "company",
  "status",
  "createdAt",
] as const;
export type RequestSortColumn = (typeof requestSortColumns)[number];
export type SortOrder = "asc" | "desc";
export type RequestAttentionFilter = "unread" | "overdue" | "";
export type RequestListFilters = {
  search: string;
  status: RequestStatus | "";
  attention: RequestAttentionFilter;
  page: number;
  sortBy: RequestSortColumn;
  sortOrder: SortOrder;
};

export function getRequestListFilters(
  params: Record<string, string | string[] | undefined>,
): RequestListFilters {
  const search = firstValue(params.search)?.trim() ?? "";
  const statusValue = firstValue(params.status);
  const status = requestStatuses.find((item) => item === statusValue) ?? "";
  const attentionValue = firstValue(params.attention);
  const attention =
    attentionValue === "unread" || attentionValue === "overdue" ? attentionValue : "";
  const pageValue = Number(firstValue(params.page));
  const sortByValue = firstValue(params.sortBy);
  const sortBy = requestSortColumns.find((item) => item === sortByValue) ?? "createdAt";
  const sortOrder = firstValue(params.sortOrder) === "asc" ? "asc" : "desc";
  return {
    search,
    status,
    attention,
    page: Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1,
    sortBy,
    sortOrder,
  };
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
