import "server-only";
import type { RequestStatus, RequestType } from "@/types/requests";
import type {
  RequestAttentionFilter,
  RequestSortColumn,
  SortOrder,
} from "@/lib/request-list-filters";
import { callApi } from "@/lib/api";
import { ApiError } from "@/lib/api-error";

export { ApiError };

export function getRequests(
  params: {
    type?: RequestType;
    status?: RequestStatus;
    attention?: RequestAttentionFilter;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: RequestSortColumn;
    sortOrder?: SortOrder;
  } = {},
) {
  return callApi((api, options) =>
    api.GET("/requests", {
      ...options,
      params: {
        // Empty filters mean "all": the API accepts only real values.
        query: {
          ...params,
          attention: params.attention || undefined,
          search: params.search || undefined,
        },
      },
    }),
  );
}

export function getRequest(
  id: string,
  history: {
    commentsPage?: number;
    activitiesPage?: number;
    consentsPage?: number;
  } = {},
) {
  return callApi((api, options) =>
    api.GET("/requests/{id}", { ...options, params: { path: { id }, query: history } }),
  );
}

export function getRequestStats() {
  return callApi((api, options) => api.GET("/requests/stats", options));
}
