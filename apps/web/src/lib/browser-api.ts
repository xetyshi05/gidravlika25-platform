import { createApiClient } from "./api-client.ts";

/** The API as the visitor's browser reaches it: NEXT_PUBLIC_API_URL is inlined at build time. */
export const browserApi = createApiClient(
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
);
