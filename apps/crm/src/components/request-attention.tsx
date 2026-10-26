import type { RequestSummary } from "@/types/requests";

type OperationalRequest = Pick<
  RequestSummary,
  | "ageMinutes"
  | "createdAt"
  | "firstRespondedAt"
  | "isSlaOverdue"
  | "isUnread"
  | "responseDueAt"
  | "status"
>;

export function RequestAttention({
  request,
  showAge = true,
}: {
  request: OperationalRequest;
  showAge?: boolean;
}) {
  const createdAt = timestamp(request.createdAt);
  const firstRespondedAt = timestamp(request.firstRespondedAt);
  const responseMinutes =
    createdAt !== null && firstRespondedAt !== null
      ? Math.max(0, Math.floor((firstRespondedAt - createdAt) / 60_000))
      : null;
  const deadline = formatDeadline(request.responseDueAt);
  const ageMinutes = Number.isFinite(request.ageMinutes)
    ? Math.max(0, Math.floor(request.ageMinutes))
    : null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
      {request.isUnread ? (
        <span className="border border-brand/30 bg-red-50 px-1.5 py-0.5 font-bold text-brand">
          Непрочитано
        </span>
      ) : null}
      {request.status === "NEW" ? (
        request.isSlaOverdue ? (
          <span className="border border-brand/30 bg-red-50 px-1.5 py-0.5 font-bold text-brand">
            SLA просрочен
          </span>
        ) : deadline ? (
          <span className="border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-800">
            Ответить до {deadline}
          </span>
        ) : null
      ) : null}
      {responseMinutes !== null ? (
        <span className="text-emerald-700">Реакция за {formatMinutes(responseMinutes)}</span>
      ) : null}
      {showAge && ageMinutes !== null ? (
        <span className="text-slate-500">Возраст: {formatMinutes(ageMinutes)}</span>
      ) : null}
    </div>
  );
}

function formatDeadline(value: unknown) {
  const valueTimestamp = timestamp(value);
  if (valueTimestamp === null) return null;

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(valueTimestamp));
}

function timestamp(value: unknown) {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const result = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} мин`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  return hours ? `${days} д ${hours} ч` : `${days} д`;
}
