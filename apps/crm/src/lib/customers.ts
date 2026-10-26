import { callApi } from "@/lib/api";

export const customerSortColumns = [
  "name",
  "company",
  "phone",
  "email",
  "requestCount",
  "lastActivity",
] as const;
export type CustomerSortColumn = (typeof customerSortColumns)[number];
export type SortOrder = "asc" | "desc";
export type CustomerListFilters = {
  search: string;
  page: number;
  sortBy: CustomerSortColumn;
  sortOrder: SortOrder;
};

export function getCustomerListFilters(
  params: Record<string, string | string[] | undefined>,
): CustomerListFilters {
  const search = firstValue(params.search)?.trim() ?? "";
  const pageValue = Number(firstValue(params.page));
  const sortBy =
    customerSortColumns.find((item) => item === firstValue(params.sortBy)) ?? "lastActivity";
  const sortOrder = firstValue(params.sortOrder) === "asc" ? "asc" : "desc";
  return {
    search,
    page: Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1,
    sortBy,
    sortOrder,
  };
}

export function getCustomers(
  params: {
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: CustomerSortColumn;
    sortOrder?: SortOrder;
  } = {},
) {
  return callApi((api, options) =>
    api.GET("/customers", {
      ...options,
      params: { query: { ...params, search: params.search || undefined } },
    }),
  );
}

export function getCustomer(
  id: string,
  params: {
    page?: number;
    limit?: number;
    sortBy?: "number" | "type" | "status" | "createdAt";
    sortOrder?: SortOrder;
  } = {},
) {
  return callApi((api, options) =>
    api.GET("/customers/{id}", { ...options, params: { path: { id }, query: params } }),
  );
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
