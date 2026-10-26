import type { Client } from "openapi-fetch";
import type { paths } from "./schema";

export declare function createApiClient(baseUrl: string): Client<paths>;

export declare function timedFetch(
  timeoutMs: number,
  onResponse?: (response: Response) => void,
): (request: Request) => Promise<Response>;
