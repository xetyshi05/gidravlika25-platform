"use client";

import { useActionState, useRef, useState } from "react";
import { IconArrowRight, IconCircleX } from "@tabler/icons-react";
import {
  addRequestComment,
  updateRequestStatus,
  type RequestActionState,
} from "@/app/requests/[id]/actions";
import { StatusBadge } from "@/components/status-badge";
import { RequestHistoryPagination } from "@/components/request-history-pagination";
import { formatDateTime } from "@/lib/request-format";
import { useModalAccessibility } from "@/lib/use-modal-accessibility";
import {
  requestStatuses,
  requestStatusLabels,
  type RequestActivity,
  type RequestComment,
  type RequestHistoryPages,
  type RequestHistoryPagination as RequestHistoryPaginationState,
  type RequestStatus,
} from "@/types/requests";
import { ActionMessage } from "@/components/action-message";

const initialState: RequestActionState = {};
const activityLabels: Record<RequestActivity["type"], string> = {
  REQUEST_CREATED: "Заявка создана",
  STATUS_CHANGED: "Статус изменён",
  MANAGER_ASSIGNED: "Назначен менеджер",
  COMMENT_ADDED: "Добавлен внутренний комментарий",
};
const nextStatusByCurrent: Partial<Record<RequestStatus, RequestStatus>> = {
  NEW: "IN_PROGRESS",
  IN_PROGRESS: "CONTACTED",
  CONTACTED: "COMPLETED",
};

export function RequestManagement({
  requestId,
  status,
  comments,
  activities,
  pagination,
  pages,
}: {
  requestId: string;
  status: RequestStatus;
  comments: RequestComment[];
  activities: RequestActivity[];
  pagination: RequestHistoryPaginationState;
  pages: RequestHistoryPages;
}) {
  const updateStatusAction = updateRequestStatus.bind(null, requestId);
  const addCommentAction = addRequestComment.bind(null, requestId);
  const [commentState, commentAction, commentPending] = useActionState(
    addCommentAction,
    initialState,
  );

  return (
    <div className="grid gap-6">
      <StatusControls key={status} status={status} updateStatusAction={updateStatusAction} />
      <section className="border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-black tracking-tight text-slate-950">Внутренние комментарии</h2>
        <form action={commentAction} className="mt-5 grid gap-3">
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Комментарий
            <textarea
              name="text"
              required
              maxLength={4000}
              rows={4}
              placeholder="Комментарий для команды"
              className="w-full resize-y border border-slate-300 bg-white px-3 py-3 text-sm font-normal text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-brand"
            />
          </label>
          <button
            type="submit"
            disabled={commentPending}
            aria-busy={commentPending}
            className="min-h-11 border border-brand bg-brand px-4 text-sm font-bold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {commentPending ? "Добавляем…" : "Добавить комментарий"}
          </button>
          <ActionMessage state={commentState} />
        </form>
        {comments.length > 0 ? (
          <div className="mt-6 grid gap-4 border-t border-slate-200 pt-5">
            {comments.map((comment) => (
              <article key={comment.id} className="border-l-2 border-brand bg-slate-50 p-4">
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {comment.text}
                </p>
                <p className="mt-3 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
                  {comment.author?.name ?? "Без автора"} · {formatDateTime(comment.createdAt)}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-5 border-t border-slate-200 pt-5 text-sm text-slate-500">
            Внутренних комментариев пока нет.
          </p>
        )}
        <RequestHistoryPagination
          requestId={requestId}
          pagination={pagination.comments}
          pages={pages}
          pageParam="commentsPage"
        />
      </section>
      <section className="border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-black tracking-tight text-slate-950">История действий</h2>
        {activities.length > 0 ? (
          <ol className="mt-5 grid gap-4">
            {activities.map((activity) => (
              <ActivityItem key={activity.id} activity={activity} />
            ))}
          </ol>
        ) : (
          <p className="mt-5 text-sm text-slate-500">История пока пуста.</p>
        )}
        <RequestHistoryPagination
          requestId={requestId}
          pagination={pagination.activities}
          pages={pages}
          pageParam="activitiesPage"
        />
      </section>
    </div>
  );
}

function ActivityItem({ activity }: { activity: RequestActivity }) {
  const status = activity.type === "STATUS_CHANGED" ? changedStatus(activity.data) : null;
  const comment = activity.type === "COMMENT_ADDED" ? activityComment(activity.data) : null;
  return (
    <li className="border-l-2 border-slate-200 pl-4">
      {status ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold text-slate-950">Статус изменён на</p>
          <StatusBadge status={status} />
        </div>
      ) : (
        <p className="text-sm font-bold text-slate-950">{activityLabels[activity.type]}</p>
      )}
      {comment ? (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{comment}</p>
      ) : null}
      <p className="mt-1 text-sm text-slate-500">
        {activity.user?.name ?? "Система"} · {formatDateTime(activity.createdAt)}
      </p>
    </li>
  );
}

function changedStatus(data: unknown): RequestStatus | null {
  if (!data || typeof data !== "object" || !("to" in data)) return null;
  const status = data.to;
  return typeof status === "string" && requestStatuses.includes(status as RequestStatus)
    ? (status as RequestStatus)
    : null;
}

function activityComment(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("text" in data)) return null;
  const text = data.text;
  return typeof text === "string" && text.trim() ? text : null;
}

function StatusControls({
  status,
  updateStatusAction,
}: {
  status: RequestStatus;
  updateStatusAction: (
    state: RequestActionState,
    formData: FormData,
  ) => Promise<RequestActionState>;
}) {
  const [statusState, statusAction, statusPending] = useActionState(
    updateStatusAction,
    initialState,
  );
  const [pendingStatus, setPendingStatus] = useState<RequestStatus | null>(null);
  const nextStatus = nextStatusByCurrent[status];
  const canCancel = status !== "COMPLETED" && status !== "CANCELLED";
  if (!nextStatus && !canCancel) return null;
  return (
    <section className="border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-black tracking-tight text-slate-950">Обработка заявки</h2>
      <form action={statusAction} className="mt-5">
        <input type="hidden" name="status" value={pendingStatus ?? ""} />
        <div className="grid gap-3">
          {nextStatus ? (
            <button
              type="button"
              disabled={statusPending}
              onClick={() => setPendingStatus(nextStatus)}
              className="inline-flex min-h-11 items-center justify-center gap-2 border border-brand bg-brand px-4 text-sm font-bold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              <IconArrowRight className="size-5" />
              {requestStatusLabels[nextStatus]}
            </button>
          ) : null}
          {canCancel ? (
            <button
              type="button"
              disabled={statusPending}
              onClick={() => setPendingStatus("CANCELLED")}
              className="inline-flex min-h-11 items-center justify-center gap-2 border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
            >
              <IconCircleX className="size-5" />
              Отменить заказ
            </button>
          ) : null}
        </div>
        {pendingStatus ? (
          <StatusConfirmation
            status={pendingStatus}
            loading={statusPending}
            onClose={() => setPendingStatus(null)}
          />
        ) : null}
        <ActionMessage state={statusState} />
      </form>
    </section>
  );
}

function StatusConfirmation({
  status,
  loading,
  onClose,
}: {
  status: RequestStatus;
  loading: boolean;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const isCancellation = status === "CANCELLED";
  const close = () => {
    if (loading || closing) return;
    setClosing(true);
    window.setTimeout(onClose, 180);
  };
  useModalAccessibility(dialogRef, close);
  return (
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className={`crm-modal-backdrop fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 ${closing ? "crm-modal-backdrop-closing" : ""}`}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="status-confirmation-title"
        aria-describedby="status-confirmation-description"
        aria-busy={loading}
        tabIndex={-1}
        className={`crm-modal-panel w-full max-w-md border border-slate-200 bg-white p-6 shadow-xl outline-none ${closing ? "crm-modal-panel-closing" : ""}`}
      >
        <h3
          id="status-confirmation-title"
          className="text-xl font-black tracking-tight text-slate-950"
        >
          Подтвердите действие
        </h3>
        <p id="status-confirmation-description" className="mt-3 text-sm leading-6 text-slate-600">
          {isCancellation
            ? "Заявка будет отменена. Вернуть её в работу через CRM будет нельзя."
            : `Статус заявки изменится на «${requestStatusLabels[status]}».`}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            data-modal-initial-focus
            onClick={close}
            disabled={loading || closing}
            className="min-h-10 border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:border-brand hover:text-brand disabled:opacity-60"
          >
            Не сейчас
          </button>
          <button
            type="submit"
            disabled={loading || closing}
            className="min-h-10 border border-brand bg-brand px-4 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {loading ? "Сохраняем…" : isCancellation ? "Отменить заказ" : "Подтвердить"}
          </button>
        </div>
      </div>
    </div>
  );
}
