import type { components, paths } from "@gidravlika25/api-contract";

/** Request and response bodies of the API, generated from its OpenAPI contract (ARCH-01). */
export type ApiSchemas = components["schemas"];
export type ApiPaths = paths;

export { createApiClient, timedFetch } from "@gidravlika25/api-contract/client";
