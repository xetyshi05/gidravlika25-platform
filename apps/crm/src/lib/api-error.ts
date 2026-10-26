export class ApiError extends Error {
  readonly status: number;
  /** A message the API wrote for the user; only set for 4xx responses. */
  readonly serverMessage?: string;

  constructor(status: number, serverMessage?: string) {
    super(
      status === 504 ? "API не ответил вовремя. Повторите запрос." : "Не удалось загрузить данные",
    );
    this.status = status;
    this.serverMessage = serverMessage;
  }
}

/** The error of a failed API call: `body` is the parsed error body (or its text). */
export function apiErrorFrom(status: number, body: unknown) {
  let serverMessage: string | undefined;
  if (status >= 400 && status < 500 && typeof body === "object" && body !== null) {
    const message = (body as { message?: unknown }).message;
    // Validation errors arrive as arrays of technical English strings; skip them.
    if (typeof message === "string" && message.trim()) serverMessage = message.trim().slice(0, 300);
  }
  return new ApiError(status, serverMessage);
}

export type ActionError = { error: string; conflict?: true };

/** Turns a failed API call into a message for a Server Action result. */
export function actionError(error: unknown, fallback: string): ActionError {
  if (!(error instanceof ApiError)) return { error: fallback };
  if (error.status === 401) return { error: "Сессия истекла. Войдите в CRM заново." };
  if (error.status === 409)
    return {
      error: error.serverMessage ?? "Данные уже изменены другим пользователем.",
      conflict: true,
    };
  if (error.status === 504) return { error: error.message };
  return { error: error.serverMessage ?? fallback };
}
