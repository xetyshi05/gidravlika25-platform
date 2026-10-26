"use client";

import { useRef, useState } from "react";
import { IconShieldLock, IconX } from "@tabler/icons-react";
import { formatDateTime } from "@/lib/request-format";
import { useModalAccessibility } from "@/lib/use-modal-accessibility";
import { RequestHistoryPagination } from "@/components/request-history-pagination";
import type { Pagination, RequestConsent, RequestHistoryPages } from "@/types/requests";

export function PersonalDataDialog({
  requestId,
  consents,
  pagination,
  pages,
  openByDefault,
}: {
  requestId: string;
  consents: RequestConsent[];
  pagination: Pagination;
  pages: RequestHistoryPages;
  openByDefault: boolean;
}) {
  const [open, setOpen] = useState(openByDefault);
  const dialogRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);

  useModalAccessibility(dialogRef, close, open);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 items-center gap-2 border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 outline-none transition-colors hover:border-brand hover:text-brand focus-visible:ring-2 focus-visible:ring-brand"
      >
        <IconShieldLock className="size-5" aria-hidden="true" />
        Персональные данные
        <span className="grid min-w-5 place-items-center bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
          {pagination.total}
        </span>
      </button>

      {open ? (
        <div
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
          className="crm-modal-backdrop fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="personal-data-dialog-title"
            tabIndex={-1}
            className="crm-modal-panel relative max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto border border-slate-200 bg-white p-6 shadow-xl outline-none"
          >
            <button
              type="button"
              onClick={close}
              aria-label="Закрыть"
              className="absolute right-4 top-4 grid size-9 place-items-center text-slate-500 hover:text-brand"
            >
              <IconX className="size-5" />
            </button>
            <div className="flex items-center gap-3 pr-12">
              <span className="grid size-10 shrink-0 place-items-center bg-red-50 text-brand">
                <IconShieldLock className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h2
                  id="personal-data-dialog-title"
                  className="text-xl font-black tracking-tight text-slate-950"
                >
                  Персональные данные
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Согласия, зафиксированные для этой заявки
                </p>
              </div>
            </div>

            {consents.length > 0 ? (
              <dl className="mt-6 grid gap-4">
                {consents.map((consent) => (
                  <div key={consent.id} className="border-l-2 border-brand pl-4">
                    <dt className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
                      Согласие на обработку
                    </dt>
                    <dd className="mt-1 text-sm leading-6 text-slate-700">
                      Принято {formatDateTime(consent.acceptedAt)} · версия{" "}
                      {consent.documentVersion}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-6 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Для этой заявки согласие в системе не зафиксировано.
              </p>
            )}

            <RequestHistoryPagination
              requestId={requestId}
              pagination={pagination}
              pages={pages}
              pageParam="consentsPage"
              keepDialogOpen
            />

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={close}
                className="min-h-10 border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:border-brand hover:text-brand"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
