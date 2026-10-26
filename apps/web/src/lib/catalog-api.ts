import { createApiClient, timedFetch, type ApiPaths, type ApiSchemas } from "./api-client.ts";
import { catalogPageQuery } from "./catalog-filter-url.ts";

// Bodies of the public catalog API, generated from its OpenAPI contract (ARCH-01).
export type CatalogCategory = ApiSchemas["CatalogCategory"];
export type CatalogSitemapProduct = ApiSchemas["CatalogSitemapProduct"];
export type CatalogProduct = ApiSchemas["CatalogProduct"];
export type CatalogSettings = ApiSchemas["PublicCatalogSettings"];
export type SiteMedia = ApiSchemas["SiteMedia"];
export type CatalogProductsPage = ApiSchemas["CatalogProductsPage"];
export type CatalogNumericRange = ApiSchemas["CatalogNumericRange"];
export type CatalogProductFilterRanges = ApiSchemas["CatalogProductFilterRanges"];
export type CatalogPageQuery = NonNullable<
  ApiPaths["/catalog/products/page"]["get"]["parameters"]["query"]
>;

export const defaultCatalogSettings: CatalogSettings = {
  lowStockThreshold: 5,
  showOutOfStock: true,
  showPrices: true,
};

export type CatalogProductFilters = {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  minPistonDiameter?: number;
  maxPistonDiameter?: number;
  minRodDiameter?: number;
  maxRodDiameter?: number;
  minStroke?: number;
  maxStroke?: number;
  minCollapsedLength?: number;
  maxCollapsedLength?: number;
  minMaxPressure?: number;
  maxMaxPressure?: number;
  minNominalPressure?: number;
  maxNominalPressure?: number;
  availability?: "in-stock" | "made-to-order";
};

const catalogApi = createApiClient(process.env.API_URL ?? "http://localhost:4000");
export const catalogRevalidateSeconds = 60;
const catalogCacheTag = "catalog";

type CatalogFetchInit = {
  next?: {
    revalidate?: number | false;
    tags?: string[];
  };
};
type CatalogRequestOptions = CatalogFetchInit & { fetch: (request: Request) => Promise<Response> };
type ApiResult<T> = { data?: T; response: Response };

export class CatalogApiError extends Error {
  readonly status: number | null;
  readonly path: string;

  constructor(
    message: string,
    options: {
      status: number | null;
      path: string;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "CatalogApiError";
    this.status = options.status;
    this.path = options.path;
  }
}

export function isCatalogNotFound(error: unknown): error is CatalogApiError {
  return error instanceof CatalogApiError && error.status === 404;
}

const cachedCatalogRequest: CatalogFetchInit = {
  next: {
    revalidate: catalogRevalidateSeconds,
    tags: [catalogCacheTag],
  },
};

async function getCatalogData<T>(
  call: (options: CatalogRequestOptions) => Promise<ApiResult<T>>,
  init: CatalogFetchInit = cachedCatalogRequest,
): Promise<T> {
  let path = "";
  let status: number | null = null;
  const fetch = timedFetch(8_000, (response) => {
    status = response.status;
  });
  let result: ApiResult<T>;

  try {
    result = await call({
      ...init,
      fetch: (request) => {
        const url = new URL(request.url);
        path = `${url.pathname}${url.search}`;
        return fetch(request);
      },
    });
  } catch (cause) {
    // No response: the API is unreachable; with a response: its body is not JSON.
    throw new CatalogApiError(
      status === null ? "Catalog API is unavailable." : "Catalog API returned an invalid response.",
      { status, path, cause },
    );
  }

  if (!result.response.ok || result.data === undefined) {
    throw new CatalogApiError(`Catalog API request failed with status ${result.response.status}.`, {
      status: result.response.status,
      path,
    });
  }

  return result.data;
}

export function getCatalogCategories(limit = 6): Promise<CatalogCategory[]> {
  return getCatalogData((options) =>
    catalogApi.GET("/catalog/categories", {
      ...options,
      params: { query: { limit: String(limit) } },
    }),
  );
}

export async function getCatalogSettings(): Promise<CatalogSettings> {
  try {
    return await getCatalogData((options) => catalogApi.GET("/catalog/settings", options));
  } catch (error) {
    // During a rolling deploy the new Web instance can briefly talk to an old
    // API instance. Its behavior equals these defaults, so keep the catalog
    // available until the API with the settings endpoint is online.
    if (error instanceof CatalogApiError && error.status === 404) {
      return defaultCatalogSettings;
    }
    throw error;
  }
}

export function getPopularProducts(limit = 4): Promise<CatalogProduct[]> {
  return getCatalogData((options) =>
    catalogApi.GET("/catalog/products", {
      ...options,
      params: { query: { limit: String(limit) } },
    }),
  );
}

export function getCatalogProductsPage(
  filters: CatalogProductFilters,
): Promise<CatalogProductsPage> {
  return getCatalogData((options) =>
    catalogApi.GET("/catalog/products/page", {
      ...options,
      params: { query: catalogPageQuery(filters) },
    }),
  );
}

export function getCatalogProductFilterRanges(): Promise<CatalogProductFilterRanges> {
  return getCatalogData((options) => catalogApi.GET("/catalog/products/filters", options));
}

export function getCatalogProduct(slug: string): Promise<CatalogProduct> {
  return getCatalogData((options) =>
    catalogApi.GET("/catalog/products/{slug}", { ...options, params: { path: { slug } } }),
  );
}

export function getCatalogSitemapProducts(): Promise<CatalogSitemapProduct[]> {
  return getCatalogData((options) => catalogApi.GET("/catalog/products/sitemap", options), {
    next: { revalidate: 3600, tags: [catalogCacheTag] },
  });
}

export function getSiteMedia(): Promise<SiteMedia[]> {
  return getCatalogData((options) => catalogApi.GET("/site-media", options));
}
