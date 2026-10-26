import type { RequestSummary } from "@/types/requests";

export function fullName(request: Pick<RequestSummary, "firstName" | "lastName" | "middleName">) {
  return [request.lastName, request.firstName, request.middleName].filter(Boolean).join(" ");
}
export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}
export function formatMoney(value: string) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(Number(value));
}
