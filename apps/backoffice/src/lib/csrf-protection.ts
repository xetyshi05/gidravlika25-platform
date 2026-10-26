import { timingSafeEqual } from "node:crypto";

export const BACKOFFICE_CSRF_COOKIE = "backoffice_csrf";
export const BACKOFFICE_CSRF_HEADER = "x-csrf-token";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const allowedContentTypes = new Set(["application/json", "multipart/form-data"]);

export type MutationRequestDetails = {
  method: string;
  requestUrl: string;
  configuredOrigin?: string;
  origin: string | null;
  fetchSite: string | null;
  contentType: string | null;
  headerToken: string | null;
  cookieToken: string | null;
  production: boolean;
};

export type MutationValidation = { ok: true } | { ok: false; status: 403 | 415; message: string };

export function isUnsafeMethod(method: string) {
  return unsafeMethods.has(method.toUpperCase());
}

export function validateMutationRequest(details: MutationRequestDetails): MutationValidation {
  if (!isUnsafeMethod(details.method)) return { ok: true };

  const expectedOrigin = resolveExpectedOrigin(
    details.configuredOrigin,
    details.requestUrl,
    details.production,
  );
  if (!expectedOrigin || details.origin !== expectedOrigin) {
    return { ok: false, status: 403, message: "Источник запроса не разрешён." };
  }
  if (details.fetchSite && details.fetchSite !== "same-origin") {
    return { ok: false, status: 403, message: "Разрешены только запросы с Backoffice." };
  }

  const mediaType = details.contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (!allowedContentTypes.has(mediaType)) {
    return { ok: false, status: 415, message: "Неподдерживаемый тип данных запроса." };
  }

  if (!tokensEqual(details.headerToken, details.cookieToken)) {
    return { ok: false, status: 403, message: "CSRF-токен отсутствует или недействителен." };
  }
  return { ok: true };
}

export function resolveExpectedOrigin(
  configuredOrigin: string | undefined,
  requestUrl: string,
  production: boolean,
) {
  if (configuredOrigin) {
    try {
      const url = new URL(configuredOrigin);
      return url.origin === configuredOrigin.replace(/\/$/, "") ? url.origin : null;
    } catch {
      return null;
    }
  }
  if (production) return null;
  return new URL(requestUrl).origin;
}

function tokensEqual(headerToken: string | null, cookieToken: string | null) {
  if (!headerToken || !cookieToken) return false;
  const header = Buffer.from(headerToken);
  const cookie = Buffer.from(cookieToken);
  return header.length === cookie.length && timingSafeEqual(header, cookie);
}
