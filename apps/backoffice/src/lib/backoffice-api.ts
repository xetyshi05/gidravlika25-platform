import type { components, paths } from "@gidravlika25/api-contract";
import { createApiClient } from "@gidravlika25/api-contract/client";
import type { Category, Product } from "@/data/catalog";
import { catalogSettingsPayload, type CatalogSettings } from "./catalog-settings.ts";
import { backofficeClientTimeout } from "./backoffice-proxy.ts";
import { fetchWithTimeout, isRequestAbort, isRequestTimeout } from "./fetch-with-timeout.ts";

export type { CatalogSettings } from "./catalog-settings.ts";

// Bodies of /backoffice, generated from the API's OpenAPI contract (ARCH-01).
type Schemas = components["schemas"];
type ProductsQuery = NonNullable<paths["/backoffice/products"]["get"]["parameters"]["query"]>;
type CategoriesQuery = NonNullable<paths["/backoffice/categories"]["get"]["parameters"]["query"]>;
type ActivitiesQuery = NonNullable<paths["/backoffice/activities"]["get"]["parameters"]["query"]>;

// The browser talks to the API through the BFF proxy /api/backoffice/*.
const proxyPrefix = "/api";
const api = createApiClient(proxyPrefix);
const csrfHeader = "X-CSRF-Token";
let csrfTokenPromise: Promise<string> | null = null;
export class BackofficeApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
type ApiResult<T> = { data?: T; error?: unknown; response: Response };
type CallOptions = { fetch: (request: Request) => Promise<Response> };
type Messages = { fallback?: string; timeout?: string; network?: string };

/** One Back Office call: CSRF, the per-route timeout and a BackofficeApiError on any failure. */
async function call<T>(
  send: (options: CallOptions) => Promise<ApiResult<T>>,
  messages: Messages = {},
): Promise<T> {
  let result: ApiResult<T>;
  try {
    result = await send({ fetch: backofficeFetch });
  } catch (error) {
    // A cancelled request is the caller's decision, not a failure to report.
    if (error instanceof BackofficeApiError || isRequestAbort(error)) throw error;
    throw new BackofficeApiError(
      isRequestTimeout(error) ? 504 : 0,
      isRequestTimeout(error)
        ? (messages.timeout ?? "Сервер не ответил вовремя. Повторите запрос.")
        : (messages.network ?? "Не удалось связаться с сервером."),
    );
  }
  const fallback = messages.fallback ?? "Не удалось выполнить запрос.";
  if (!result.response.ok)
    throw new BackofficeApiError(result.response.status, errorMessage(result.error) ?? fallback);
  if (result.data === undefined) throw new BackofficeApiError(502, fallback);
  return result.data;
}
function errorMessage(body: unknown) {
  const message =
    typeof body === "object" && body !== null ? (body as { message?: unknown }).message : null;
  if (Array.isArray(message)) return message.join(" ");
  return typeof message === "string" ? message : undefined;
}
/** Multipart bodies: files go as they are, everything else as text; absent fields are skipped. */
function formData(body: Record<string, unknown>) {
  const form = new FormData();
  for (const [name, value] of Object.entries(body)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item === undefined || item === null) continue;
      form.append(name, item instanceof Blob ? item : String(item));
    }
  }
  return form;
}
/** The list endpoints answer with rows, ids or a page depending on the query. */
function expectShape<T, U extends T>(data: T, isShape: (value: T) => value is U): U {
  if (!isShape(data)) throw new BackofficeApiError(502, "Сервер вернул неожиданный ответ.");
  return data;
}
const isRows = <R>(value: R[] | object): value is R[] => Array.isArray(value);
const isIds = (value: object): value is Schemas["IdList"] => "ids" in value;
const isPage = <P extends { items: unknown[] }>(value: object): value is P => "items" in value;

export type ProductTableFilter = {
  id: string;
  mode: string;
  value?: string;
  values?: string[];
  min?: string;
  max?: string;
};
export type ProductTableQuery = {
  page: number;
  pageSize: number;
  sortBy: NonNullable<ProductsQuery["sortBy"]>;
  sortDir: "asc" | "desc";
  filters?: ProductTableFilter[];
};
export type ProductTablePage = Schemas["BackofficeProductPage"];
export type SiteMedia = Schemas["SiteMedia"];
export type SiteMediaCrop = Schemas["SiteMediaCropDto"];
export type MediaStorageGroupStatus = Schemas["MediaStorageGroupStatus"];
export type MediaStorageStatus = Schemas["MediaStorageStatus"];
export type SiteMediaOriginalsImportResult = Schemas["OriginalsImportResult"];
export type OriginalsStorageSynchronizationResult = Schemas["OriginalsSynchronizationResult"];
export type CategoryTableQuery = {
  page: number;
  pageSize: number;
  sortBy: NonNullable<CategoriesQuery["sortBy"]>;
  sortDir: "asc" | "desc";
  filters?: Record<string, string>;
};
export type CategoryTablePage = Schemas["BackofficeCategoryPage"];
export function getProducts(): Promise<Product[]> {
  return call((options) => api.GET("/backoffice/products", options)).then((data) =>
    expectShape(data, isRows),
  );
}
export function getProductsPage(query: ProductTableQuery): Promise<ProductTablePage> {
  return call((options) =>
    api.GET("/backoffice/products", {
      ...options,
      params: { query: { ...query, filters: JSON.stringify(query.filters ?? []) } },
    }),
  ).then((data) => expectShape(data, isPage<ProductTablePage>));
}
export function getProductIds(filters: ProductTableFilter[]) {
  return call((options) =>
    api.GET("/backoffice/products", {
      ...options,
      params: { query: { idsOnly: true, filters: JSON.stringify(filters) } },
    }),
  ).then((data) => expectShape(data, isIds));
}
export function getProduct(id: string) {
  return call((options) =>
    api.GET("/backoffice/products/{id}", { ...options, params: { path: { id } } }),
  );
}
export function getCategories(): Promise<Category[]> {
  return call((options) => api.GET("/backoffice/categories", options)).then((data) =>
    expectShape(data, isRows),
  );
}
export function getSiteMedia() {
  return call((options) => api.GET("/backoffice/media", options));
}
export function getMediaStorageStatus() {
  return call((options) => api.GET("/backoffice/media/storage-status", options));
}
export type OriginalsImportProgress = { done: number; total: number };
export async function importSiteMediaOriginals(
  files: File[],
  onProgress?: (progress: OriginalsImportProgress) => void,
) {
  return importOriginalFiles("site", files, onProgress);
}
export async function importCatalogImageOriginals(
  files: File[],
  onProgress?: (progress: OriginalsImportProgress) => void,
) {
  return importOriginalFiles("catalog", files, onProgress);
}
export function synchronizeOriginalsFromStorage() {
  return call((options) => api.POST("/backoffice/media/originals/synchronize", options));
}
/**
 * Sends originals one file per request: a single multipart request with many
 * files exceeds the Nginx body limit and the proxy timeouts.
 */
async function importOriginalFiles(
  target: "site" | "catalog",
  files: File[],
  onProgress?: (progress: OriginalsImportProgress) => void,
) {
  const total: SiteMediaOriginalsImportResult = {
    imported: 0,
    alreadyPresent: 0,
    notMatched: [],
    ambiguous: [],
    duplicates: [],
  };
  onProgress?.({ done: 0, total: files.length });
  for (const [index, file] of files.entries()) {
    if (file.size > 8 * 1024 * 1024) {
      total.notMatched.push(`${file.name} (больше 8 МБ)`);
    } else {
      const result = await importOriginalFile(target, file);
      total.imported += result.imported;
      total.alreadyPresent += result.alreadyPresent;
      total.notMatched.push(...result.notMatched);
      total.ambiguous.push(...result.ambiguous);
      total.duplicates.push(...result.duplicates);
    }
    onProgress?.({ done: index + 1, total: files.length });
  }
  return total;
}
async function importOriginalFile(target: "site" | "catalog", file: File) {
  const request = { body: { files: [file] }, bodySerializer: formData };
  try {
    return await call(
      (options) =>
        target === "site"
          ? api.POST("/backoffice/media/originals/import", { ...options, ...request })
          : api.POST("/backoffice/media/originals/import-catalog", { ...options, ...request }),
      {
        fallback: "не удалось загрузить оригинал.",
        timeout: "сервер не ответил вовремя. Повторите загрузку.",
        network: "не удалось связаться с сервером.",
      },
    );
  } catch (error) {
    if (!(error instanceof BackofficeApiError)) throw error;
    throw new BackofficeApiError(error.status, `${file.name}: ${error.message}`);
  }
}
export function uploadSiteMedia(input: {
  file: File;
  kind: SiteMedia["kind"];
  alt: string;
  title: string;
  crop?: SiteMediaCrop;
}) {
  return call(
    (options) =>
      api.POST("/backoffice/media", {
        ...options,
        body: {
          file: input.file,
          kind: input.kind,
          alt: input.alt,
          title: input.title || undefined,
          crop: input.crop ? JSON.stringify(input.crop) : undefined,
        },
        bodySerializer: formData,
      }),
    { fallback: "Не удалось сохранить изображение." },
  );
}
export function deleteSiteMedia(id: string) {
  return call((options) =>
    api.DELETE("/backoffice/media/{id}", { ...options, params: { path: { id } } }),
  );
}
export function replaceSiteMedia(id: string, file: File, crop?: SiteMediaCrop) {
  return call(
    (options) =>
      api.POST("/backoffice/media/{id}/image", {
        ...options,
        params: { path: { id } },
        body: { file, crop: crop ? JSON.stringify(crop) : undefined },
        bodySerializer: formData,
      }),
    { fallback: "Не удалось заменить изображение." },
  );
}
export function cropSiteMedia(id: string, crop: SiteMediaCrop) {
  return call((options) =>
    api.POST("/backoffice/media/{id}/crop", {
      ...options,
      params: { path: { id } },
      body: { crop },
    }),
  );
}
export function siteMediaSourcePath(id: string) {
  return `${proxyPrefix}/backoffice/media/${encodeURIComponent(id)}/image-source`;
}
export function updateSiteMedia(
  id: string,
  input: {
    isActive?: boolean;
    kind?: "GALLERY" | "MAIN_GALLERY";
    position?: number;
  },
) {
  return call((options) =>
    api.PATCH("/backoffice/media/{id}", {
      ...options,
      params: { path: { id } },
      body: input,
    }),
  );
}
export function getCategoriesPage(query: CategoryTableQuery): Promise<CategoryTablePage> {
  return call((options) =>
    api.GET("/backoffice/categories", {
      ...options,
      params: { query: { ...query, filters: JSON.stringify(query.filters ?? {}) } },
    }),
  ).then((data) => expectShape(data, isPage<CategoryTablePage>));
}
export function getCategoryIds(filters: Record<string, string>) {
  return call((options) =>
    api.GET("/backoffice/categories", {
      ...options,
      params: { query: { idsOnly: true, filters: JSON.stringify(filters) } },
    }),
  ).then((data) => expectShape(data, isIds));
}
export function createCategory(values: Schemas["CategoryDto"]) {
  return call((options) => api.POST("/backoffice/categories", { ...options, body: values }));
}
/** PATCH: omitted fields stay unchanged on the server, `null` clears a nullable field. */
export function updateCategory(id: string, values: Schemas["UpdateCategoryDto"]) {
  return call((options) =>
    api.PATCH("/backoffice/categories/{id}", {
      ...options,
      params: { path: { id } },
      body: values,
    }),
  );
}
/** Changes stock by `delta` on the server, so parallel changes add up. */
export function changeStock(id: string, delta: number) {
  return call((options) =>
    api.PATCH("/backoffice/products/{id}/stock", {
      ...options,
      params: { path: { id } },
      body: { delta },
    }),
  );
}
export function deleteProducts(ids: string[]) {
  return call((options) => api.DELETE("/backoffice/products", { ...options, body: { ids } }));
}
export function deleteCategories(ids: string[]) {
  return call((options) => api.DELETE("/backoffice/categories", { ...options, body: { ids } }));
}
export function bulkStock(ids: string[], delta: number) {
  return call((options) =>
    api.PATCH("/backoffice/products/bulk/stock", { ...options, body: { ids, delta } }),
  );
}
export function bulkUpdateProducts(
  ids: string[],
  values: { isActive?: boolean; isFeatured?: boolean; categoryId?: string },
) {
  return call((options) =>
    api.PATCH("/backoffice/products/bulk", { ...options, body: { ids, ...values } }),
  );
}
export function bulkUpdateCategories(ids: string[], isActive: boolean) {
  return call((options) =>
    api.PATCH("/backoffice/categories/bulk", { ...options, body: { ids, isActive } }),
  );
}
export type BackofficeUser = Schemas["BackofficeUser"];
export type ResourceUsage = Schemas["ResourceUsage"];
export type ServerResources = Schemas["ServerResources"];
export type ManagedUser = Schemas["StaffUserWithSessions"];
export type UserSession = Schemas["StaffSession"];
export type BackofficeActivity = Schemas["BackofficeActivity"];
export type ActivityScope = NonNullable<ActivitiesQuery["scope"]>;
export type ActivityQuery = {
  page: number;
  pageSize: number;
  userId?: string;
  action?: string;
  scope?: ActivityScope;
  dateFrom?: string;
  dateTo?: string;
};
export type ActivityPage = Schemas["BackofficeActivityPage"];
export function getSettings() {
  return call((options) => api.GET("/backoffice/settings", options));
}
export function saveSettings(values: CatalogSettings) {
  return call((options) =>
    api.PATCH("/backoffice/settings", { ...options, body: catalogSettingsPayload(values) }),
  );
}
export function getBackofficeUser(signal?: AbortSignal) {
  return call((options) => api.GET("/backoffice/me", { ...options, signal }));
}
export function getServerResources() {
  return call((options) =>
    api.GET("/backoffice/server-resources", { ...options, cache: "no-store" }),
  );
}
export function getUsers() {
  return call((options) => api.GET("/backoffice/users", options));
}
export function createUser(values: Schemas["CreateUserDto"]) {
  return call((options) => api.POST("/backoffice/users", { ...options, body: values }));
}
export function updateUser(id: string, values: Schemas["UpdateUserDto"]) {
  return call((options) =>
    api.PATCH("/backoffice/users/{id}", { ...options, params: { path: { id } }, body: values }),
  );
}
export function updateUserPassword(id: string, password: string) {
  return call((options) =>
    api.PATCH("/backoffice/users/{id}/password", {
      ...options,
      params: { path: { id } },
      body: { password },
    }),
  );
}
export function resetUserTwoFactor(id: string) {
  return call((options) =>
    api.POST("/backoffice/users/{id}/reset-two-factor", { ...options, params: { path: { id } } }),
  );
}
export function revokeUserSessions(id: string) {
  return call((options) =>
    api.POST("/backoffice/users/{id}/revoke-sessions", { ...options, params: { path: { id } } }),
  );
}
export function getUserSessions(id: string) {
  return call((options) =>
    api.GET("/backoffice/users/{id}/sessions", { ...options, params: { path: { id } } }),
  );
}
export function revokeUserSession(userId: string, sessionId: string) {
  return call((options) =>
    api.POST("/backoffice/users/{id}/sessions/{sessionId}/revoke", {
      ...options,
      params: { path: { id: userId, sessionId } },
    }),
  );
}
export function getBackofficeActivities(query: ActivityQuery) {
  return call((options) =>
    api.GET("/backoffice/activities", {
      ...options,
      params: {
        query: {
          page: query.page,
          pageSize: query.pageSize,
          userId: query.userId || undefined,
          action: query.action || undefined,
          scope: query.scope && query.scope !== "ALL" ? query.scope : undefined,
          dateFrom: query.dateFrom || undefined,
          dateTo: query.dateTo || undefined,
        },
      },
    }),
  );
}
/**
 * Creates a product, or saves the edit form of `existing`: the API answers 409
 * if the product changed after the form was opened (its `updatedAt`).
 */
export function saveProduct(
  values: Schemas["ProductDto"],
  existing?: Pick<Product, "id" | "updatedAt">,
) {
  return call((options) =>
    existing
      ? api.PATCH("/backoffice/products/{id}", {
          ...options,
          params: { path: { id: existing.id } },
          body: { ...values, expectedUpdatedAt: existing.updatedAt },
        })
      : api.POST("/backoffice/products", { ...options, body: values }),
  );
}
export async function uploadProductImage(id: string, file: File) {
  if (file.size > 8 * 1024 * 1024)
    throw new BackofficeApiError(413, "Размер изображения не должен превышать 8 МБ.");
  // Usually fast: the server reuses the prepared preview of the same file.
  // Without it (for example after an API restart) background removal runs
  // again, so the timeout matches the preview.
  return call(
    (options) =>
      api.POST("/backoffice/products/{id}/image", {
        ...options,
        params: { path: { id } },
        body: { file },
        bodySerializer: formData,
      }),
    {
      fallback: "Не удалось загрузить изображение.",
      timeout: "Загрузка изображения заняла слишком много времени. Попробуйте ещё раз.",
      network: "Не удалось загрузить изображение: нет соединения с сервером.",
    },
  );
}
export async function previewProductImage(file: File) {
  if (file.size > 8 * 1024 * 1024)
    throw new BackofficeApiError(413, "Размер изображения не должен превышать 8 МБ.");
  return call(
    (options) =>
      api.POST("/backoffice/products/image-preview", {
        ...options,
        body: { file },
        bodySerializer: formData,
        parseAs: "blob",
      }),
    {
      fallback: "Не удалось подготовить изображение.",
      timeout: "Подготовка изображения заняла слишком много времени. Попробуйте ещё раз.",
      network: "Не удалось связаться с сервисом обработки изображений.",
    },
  );
}

/**
 * The `fetch` of every call: the timeout of the route (backoffice-proxy.ts),
 * and for a mutation the CSRF header — with one retry on a fresh token when
 * the BFF rejects an expired one. The BFF accepts mutations only as JSON or
 * multipart, so a bodyless POST/PATCH/DELETE is still sent as JSON.
 */
export async function backofficeFetch(request: Request) {
  const url = new URL(request.url);
  const path = `${url.pathname.replace(/^\/api\/backoffice/, "")}${url.search}`;
  const timeoutMs = backofficeClientTimeout(request.method, path);
  const send = (attempt: Request) =>
    fetchWithTimeout(attempt, { signal: attempt.signal }, timeoutMs);
  if (!isUnsafeMethod(request.method)) return send(request);

  if (!request.headers.has("Content-Type")) request.headers.set("Content-Type", "application/json");
  const retry = request.clone();
  request.headers.set(csrfHeader, await getCsrfToken(false));
  const response = await send(request);
  if (response.status !== 403 || response.headers.get("x-csrf-error") !== "1") return response;
  retry.headers.set(csrfHeader, await getCsrfToken(true));
  return send(retry);
}

function isUnsafeMethod(method: string) {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

async function getCsrfToken(refresh = false) {
  if (refresh) csrfTokenPromise = null;
  csrfTokenPromise ??= loadCsrfToken().catch((error: unknown) => {
    csrfTokenPromise = null;
    throw error;
  });
  return csrfTokenPromise;
}

async function loadCsrfToken() {
  // A route of the BFF itself, not of the API: outside the contract.
  const response = await fetchWithTimeout(
    `${proxyPrefix}/backoffice/csrf`,
    { cache: "no-store" },
    10_000,
  );
  if (!response.ok) {
    throw new BackofficeApiError(response.status, "Не удалось подготовить защищённый запрос.");
  }
  const body = (await response.json()) as { token?: unknown };
  if (typeof body.token !== "string" || body.token.length < 32) {
    throw new BackofficeApiError(502, "Сервер вернул некорректный CSRF-токен.");
  }
  return body.token;
}
