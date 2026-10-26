import { createApiClient, timedFetch, type ApiSchemas } from "./api-client.ts";
import { isRequestTimeout } from "./fetch-with-timeout.ts";
import { PERSONAL_DATA_DOCUMENT_VERSION } from "./personal-data.ts";

export { PERSONAL_DATA_DOCUMENT_VERSION } from "./personal-data.ts";

type CreatedRequestResponse = {
  number: string;
};

type RequestApiErrorStatus = 400 | 404 | 409 | 412 | 429 | 500 | "network" | "timeout" | "captcha";

const pendingIdempotencyKeys = new Map<string, string>();

export class RequestApiError extends Error {
  readonly status: RequestApiErrorStatus;
  /** Machine-readable reason from the API, for example `CAPTCHA_EXPIRED`. */
  readonly code: string | undefined;

  constructor(status: RequestApiErrorStatus, code?: string) {
    super("Request API error");
    this.status = status;
    this.code = code;
  }
}

/** The API rejected the anti-spam check; a fresh check may succeed. */
export function isCaptchaError(error: unknown) {
  return (
    error instanceof RequestApiError &&
    (error.status === "captcha" || (error.status === 400 && !!error.code?.startsWith("CAPTCHA_")))
  );
}

/** What the site always sends besides the API's own fields: a solved ALTCHA and the active consent. */
type SiteFormFields = {
  /** ALTCHA payload from the spam protection widget. */
  altcha: string;
  personalDataConsent: true;
  documentVersion: typeof PERSONAL_DATA_DOCUMENT_VERSION;
};

// Request bodies generated from the API's DTOs (ARCH-01).
export type CartRequestPayload = ApiSchemas["CreateCartRequestDto"] & SiteFormFields;
export type DeliveryAddressDetails = ApiSchemas["DeliveryAddressDetailsDto"];
export type CustomRequestPayload = ApiSchemas["CreateCustomRequestDto"] & SiteFormFields;
export type WholesaleRequestPayload = ApiSchemas["CreateWholesaleRequestDto"] & SiteFormFields;
type PublicRequestReceipt = ApiSchemas["PublicRequestReceipt"];
type PublicRequestOptions = {
  params: { header: { "idempotency-key": string } };
  fetch: (request: Request) => Promise<Response>;
};
type PublicRequestResult = { data?: PublicRequestReceipt; error?: unknown; response: Response };

function getApiUrl() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

  if (!apiUrl) {
    throw new RequestApiError("network");
  }

  return apiUrl;
}

function errorCode(body: unknown) {
  return typeof body === "object" &&
    body !== null &&
    typeof (body as { code?: unknown }).code === "string"
    ? (body as { code: string }).code
    : undefined;
}

async function createRequest(
  path: string,
  payload: SiteFormFields,
  send: (options: PublicRequestOptions) => Promise<PublicRequestResult>,
): Promise<CreatedRequestResponse> {
  let result: PublicRequestResult;
  // The ALTCHA payload changes between attempts; a retry of the same request
  // must keep its Idempotency-Key so the API returns the original receipt.
  const requestFingerprint = `${path}:${JSON.stringify({ ...payload, altcha: undefined })}`;
  const idempotencyKey = pendingIdempotencyKeys.get(requestFingerprint) ?? crypto.randomUUID();
  if (!pendingIdempotencyKeys.has(requestFingerprint) && pendingIdempotencyKeys.size >= 50) {
    const oldestFingerprint = pendingIdempotencyKeys.keys().next().value as string | undefined;
    if (oldestFingerprint) pendingIdempotencyKeys.delete(oldestFingerprint);
  }
  pendingIdempotencyKeys.set(requestFingerprint, idempotencyKey);

  let responded = false;
  try {
    result = await send({
      params: { header: { "idempotency-key": idempotencyKey } },
      fetch: timedFetch(15_000, () => {
        responded = true;
      }),
    });
  } catch (error) {
    // A response that is not JSON is a server failure, not a lost connection.
    if (responded) throw new RequestApiError(500);
    throw new RequestApiError(isRequestTimeout(error) ? "timeout" : "network");
  }

  const { response } = result;
  if (!response.ok) {
    const status: RequestApiErrorStatus =
      response.status === 400 ||
      response.status === 404 ||
      response.status === 409 ||
      response.status === 412 ||
      response.status === 429
        ? response.status
        : 500;
    if (status !== 429 && status !== 500) pendingIdempotencyKeys.delete(requestFingerprint);
    throw new RequestApiError(status, errorCode(result.error));
  }

  if (typeof result.data?.number !== "string") {
    throw new RequestApiError(500);
  }

  pendingIdempotencyKeys.delete(requestFingerprint);
  return { number: result.data.number };
}

function requestsApi() {
  return createApiClient(getApiUrl());
}

export function createCartRequest(payload: CartRequestPayload) {
  return createRequest("/requests/cart", payload, (options) =>
    requestsApi().POST("/requests/cart", { ...options, body: payload }),
  );
}

export function createCustomRequest(payload: CustomRequestPayload) {
  return createRequest("/requests/custom", payload, (options) =>
    requestsApi().POST("/requests/custom", { ...options, body: payload }),
  );
}

export function createWholesaleRequest(payload: WholesaleRequestPayload) {
  return createRequest("/requests/wholesale", payload, (options) =>
    requestsApi().POST("/requests/wholesale", { ...options, body: payload }),
  );
}

export function getRequestErrorMessage(error: unknown) {
  if (!(error instanceof RequestApiError)) {
    return "Не удалось отправить заявку. Попробуйте ещё раз.";
  }

  if (isCaptchaError(error)) {
    return "Не удалось подтвердить, что заявку отправляет человек. Обновите страницу и отправьте заявку ещё раз.";
  }

  if (error.status === 400) {
    return "Проверьте заполнение полей и данные заказа.";
  }

  if (error.status === 404) {
    return "Один из товаров больше недоступен. Обновите корзину и попробуйте ещё раз.";
  }

  if (error.status === 409) {
    return "Не удалось создать заявку. Попробуйте ещё раз.";
  }

  if (error.status === 412) {
    return "Документы обработки персональных данных обновились. Обновите страницу и подтвердите согласие повторно.";
  }

  if (error.status === 429 && error.code === "PUBLIC_REQUEST_CONTACT_LIMITED") {
    return "С этим телефоном или email уже отправлено много заявок. Подождите час или позвоните нам.";
  }

  if (error.status === 429 && error.code === "PUBLIC_REQUEST_BUDGET_EXHAUSTED") {
    return "Сейчас мы получаем слишком много заявок. Попробуйте позже или позвоните нам.";
  }

  if (error.status === 429) {
    return "Слишком много попыток. Подождите минуту и отправьте заявку снова.";
  }

  if (error.status === "timeout") {
    return "Сервер не ответил вовремя. Проверьте соединение и отправьте заявку ещё раз.";
  }

  return "Не удалось отправить заявку. Попробуйте ещё раз.";
}
