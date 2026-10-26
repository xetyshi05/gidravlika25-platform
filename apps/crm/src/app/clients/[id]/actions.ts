"use server";

import { revalidatePath } from "next/cache";
import { callApi, type ApiSchemas } from "@/lib/api";
import { ApiError, actionError, type ActionError } from "@/lib/api-error";

export type CustomerActionState = Partial<ActionError> & { success?: string };

export async function updateCustomer(
  customerId: string,
  _previousState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const firstName = requiredText(formData, "firstName");
  const lastName = requiredText(formData, "lastName");
  const phone = requiredText(formData, "phone");
  if (!firstName || !lastName || !phone) return { error: "Заполните имя, фамилию и телефон." };
  try {
    await callApi((api, options) =>
      api.PATCH("/customers/{id}", {
        ...options,
        params: { path: { id: customerId } },
        body: {
          // The version the form was opened with: a concurrent edit makes the API answer 409.
          expectedUpdatedAt: requiredText(formData, "expectedUpdatedAt"),
          firstName,
          lastName,
          phone,
          middleName: optionalText(formData, "middleName"),
          email: optionalText(formData, "email"),
          company: optionalText(formData, "company"),
        },
      }),
    );
  } catch (error) {
    return actionError(error, "Не удалось сохранить данные клиента.");
  }
  revalidatePath(`/clients/${customerId}`);
  revalidatePath("/clients");
  return { success: "Данные клиента сохранены." };
}

export async function mergeCustomer(
  customerId: string,
  _previousState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const sourceCustomerId = requiredText(formData, "sourceCustomerId");
  if (!sourceCustomerId) return { error: "Выберите карточку для объединения." };
  const payload: ApiSchemas["MergeCustomerDto"] = { sourceCustomerId };
  for (const field of mergeSelectionFields) {
    const selection = requiredText(formData, field);
    if (selection === "TARGET" || selection === "SOURCE") payload[field] = selection;
  }
  try {
    await callApi((api, options) =>
      api.POST("/customers/{id}/merge", {
        ...options,
        params: { path: { id: customerId } },
        body: payload,
      }),
    );
  } catch (error) {
    // The API asks for a missing choice when contacts changed after the dialog opened.
    if (error instanceof ApiError && error.serverMessage?.startsWith("Выберите значение"))
      return {
        error:
          "Контактные данные изменились. Закройте окно, обновите страницу и выберите значения заново.",
        conflict: true,
      };
    return actionError(error, "Не удалось объединить карточки клиентов.");
  }
  revalidatePath(`/clients/${customerId}`);
  revalidatePath("/clients");
  return { success: "Карточки клиентов объединены." };
}

const mergeSelectionFields = [
  "firstNameSelection",
  "lastNameSelection",
  "middleNameSelection",
  "phoneSelection",
  "emailSelection",
  "companySelection",
] as const;

export async function anonymizeCustomer(
  customerId: string,
  _previousState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const reason = requiredText(formData, "reason");
  const confirmation = requiredText(formData, "confirmation");
  if (!reason) return { error: "Укажите основание для обезличивания." };
  if (confirmation !== "ОБЕЗЛИЧИТЬ")
    return { error: "Введите ОБЕЗЛИЧИТЬ без изменений, чтобы подтвердить операцию." };
  try {
    await callApi((api, options) =>
      api.POST("/customers/{id}/anonymize", {
        ...options,
        params: { path: { id: customerId } },
        body: { reason, confirmation },
      }),
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 403)
      return { error: "Обезличивать данные может только администратор." };
    return actionError(error, "Не удалось обезличить данные. Повторите попытку.");
  }
  revalidatePath(`/clients/${customerId}`);
  revalidatePath("/clients");
  revalidatePath("/requests");
  return { success: "Персональные данные клиента и связанных заявок обезличены." };
}

function requiredText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}
function optionalText(formData: FormData, name: string) {
  return requiredText(formData, name) || null;
}
