"use server";

import { revalidatePath } from "next/cache";
import { callApi } from "@/lib/api";
import { actionError, type ActionError } from "@/lib/api-error";
import { requestStatuses, type RequestStatus } from "@/types/requests";

export type RequestActionState = Partial<ActionError> & { success?: string };

export async function updateRequestStatus(
  requestId: string,
  _previousState: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const status = formData.get("status");
  if (typeof status !== "string" || !requestStatuses.includes(status as RequestStatus))
    return { error: "Выберите корректный статус." };
  try {
    await callApi((api, options) =>
      api.PATCH("/requests/{id}/status", {
        ...options,
        params: { path: { id: requestId } },
        body: { status: status as RequestStatus },
      }),
    );
  } catch (error) {
    return actionError(error, "Не удалось обновить статус.");
  }
  revalidatePath(`/requests/${requestId}`);
  return { success: "Статус обновлён." };
}

export async function addRequestComment(
  requestId: string,
  _previousState: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const text = formData.get("text");
  if (typeof text !== "string" || !text.trim()) return { error: "Введите текст комментария." };
  try {
    await callApi((api, options) =>
      api.POST("/requests/{id}/comments", {
        ...options,
        params: { path: { id: requestId } },
        body: { text },
      }),
    );
  } catch (error) {
    return actionError(error, "Не удалось добавить комментарий.");
  }
  revalidatePath(`/requests/${requestId}`);
  return { success: "Комментарий добавлен." };
}

export async function markRequestRead(requestId: string) {
  try {
    await callApi((api, options) =>
      api.POST("/requests/{id}/read", { ...options, params: { path: { id: requestId } } }),
    );
  } catch {
    // Read markers are best-effort and must never block opening a request.
  }
}
