import { cookies } from "next/headers";
import {
  BACKOFFICE_CSRF_COOKIE,
  BACKOFFICE_CSRF_HEADER,
  validateMutationRequest,
} from "@/lib/csrf-protection";
import { backofficeProxyTimeout, isSafeBackofficePath } from "@/lib/backoffice-proxy";
import { fetchWithTimeout, isRequestTimeout } from "@/lib/fetch-with-timeout";

const upstream = process.env.API_URL ?? "http://localhost:4000";
async function forward(req: Request, ctx: RouteContext<"/api/backoffice/[...path]">) {
  const { path } = await ctx.params;
  if (!isSafeBackofficePath(path))
    return Response.json(
      { message: "Раздел не найден." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  const cookieStore = await cookies();
  const token = cookieStore.get("backoffice_session")?.value;
  if (!token) return Response.json({ message: "Требуется авторизация." }, { status: 401 });
  const mutationValidation = validateMutationRequest({
    method: req.method,
    requestUrl: req.url,
    configuredOrigin: process.env.BACKOFFICE_ORIGIN,
    origin: req.headers.get("origin"),
    fetchSite: req.headers.get("sec-fetch-site"),
    contentType: req.headers.get("content-type"),
    headerToken: req.headers.get(BACKOFFICE_CSRF_HEADER),
    cookieToken: cookieStore.get(BACKOFFICE_CSRF_COOKIE)?.value ?? null,
    production: process.env.NODE_ENV === "production",
  });
  if (!mutationValidation.ok) {
    return Response.json(
      { message: mutationValidation.message },
      {
        status: mutationValidation.status,
        headers: { "Cache-Control": "no-store", "X-CSRF-Error": "1" },
      },
    );
  }
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  const type = req.headers.get("content-type");
  if (type) headers.set("Content-Type", type);
  const search = new URL(req.url).search;
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${upstream}/backoffice/${path.join("/")}${search}`,
      {
        method: req.method,
        headers,
        body: req.method === "GET" ? undefined : await req.arrayBuffer(),
      },
      backofficeProxyTimeout(req.method, path),
    );
  } catch (error) {
    return Response.json(
      {
        message: isRequestTimeout(error)
          ? "API не ответил вовремя. Повторите запрос."
          : "Не удалось связаться с API.",
      },
      { status: isRequestTimeout(error) ? 504 : 502 },
    );
  }
  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
  });
}
export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
