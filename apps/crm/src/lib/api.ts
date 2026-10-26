import "server-only";
import { cookies } from "next/headers";
import type { components } from "@gidravlika25/api-contract";
import { createApiClient, timedFetch } from "@gidravlika25/api-contract/client";
import { ApiError, apiErrorFrom } from "@/lib/api-error";
import { isRequestTimeout } from "@/lib/fetch-with-timeout";

/** Request and response bodies of the API, generated from its OpenAPI contract (ARCH-01). */
export type ApiSchemas = components["schemas"];

const api = createApiClient(process.env.API_URL ?? "http://localhost:4000");
// Every call carries the CRM session unless it sets Authorization itself.
api.use({
  async onRequest({ request }) {
    if (request.headers.has("Authorization")) return request;
    const token = (await cookies()).get("crm_session")?.value;
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  },
});

type CrmApi = typeof api;
type CallOptions = { cache: "no-store"; fetch: (request: Request) => Promise<Response> };
type ApiResult<T> = { data?: T; error?: unknown; response: Response };

/**
 * One API call of the CRM server: fresh data every time, a 10 s timeout, and
 * every failure as ApiError (504 timeout, 502 unreachable or unreadable).
 */
export async function callApi<T>(
  call: (api: CrmApi, options: CallOptions) => Promise<ApiResult<T>>,
): Promise<T> {
  let result: ApiResult<T>;
  try {
    result = await call(api, { cache: "no-store", fetch: timedFetch(10_000) });
  } catch (error) {
    throw new ApiError(isRequestTimeout(error) ? 504 : 502);
  }
  if (!result.response.ok) throw apiErrorFrom(result.response.status, result.error);
  if (result.data === undefined) throw new ApiError(502);
  return result.data;
}
