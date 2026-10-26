"use client";

import { IconBolt, IconCheck, IconSelectAll, IconTrash, IconX } from "@tabler/icons-react";
import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useModalAccessibility } from "@/lib/use-modal-accessibility";

type ProductBulkActionsProps = {
  selectedCount: number;
  total: number;
  entityName: string;
  onSelectAll: () => Promise<void>;
  onClear: () => void;
  onActivate?: () => Promise<void>;
  onDeactivate?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  additionalActions?: ReactNode;
  actionLabel?: string;
  dialogTitle?: string;
};

export function ProductBulkActions({
  selectedCount,
  total,
  entityName,
  onSelectAll,
  onClear,
  onActivate,
  onDeactivate,
  onDelete,
  additionalActions,
  actionLabel = "Действия",
  dialogTitle,
}: ProductBulkActionsProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const close = () => {
    if (!busy) setActionsOpen(false);
  };
  useModalAccessibility(dialogRef, close, actionsOpen);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      setActionsOpen(false);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!onDelete) return;
    setBusy(true);
    try {
      await onDelete();
      setActionsOpen(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bo-bulk-toolbar flex flex-wrap items-center gap-1 rounded-md border border-line bg-surface-raised shadow-sm">
      <span className="inline-flex h-9 items-center rounded-md bg-field px-3 text-sm font-bold tracking-wide text-copy">
        ВЫБРАНО: {selectedCount}
      </span>
      <div className="flex items-center">
        <button
          type="button"
          data-tooltip="Выбрать все результаты фильтра"
          aria-label="Выбрать все результаты фильтра"
          disabled={selectedCount >= total || busy}
          onClick={() => void onSelectAll()}
          className="bo-tooltip grid size-9 place-items-center rounded-md text-copy-muted hover:bg-field hover:text-copy disabled:cursor-not-allowed disabled:opacity-35"
        >
          <IconSelectAll className="size-5" />
        </button>
        <button
          type="button"
          data-tooltip="Очистить выбор"
          aria-label="Очистить выбор"
          disabled={busy}
          onClick={onClear}
          className="bo-tooltip grid size-9 place-items-center rounded-md text-copy-muted hover:bg-field hover:text-copy disabled:cursor-not-allowed disabled:opacity-35"
        >
          <IconX className="size-5" />
        </button>
      </div>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setActionsOpen(true)}
        className="ml-1 inline-flex h-9 items-center gap-2 rounded-md border border-brand/50 bg-brand-soft px-4 text-sm font-semibold text-brand transition-colors hover:bg-brand hover:text-white"
      >
        <IconBolt className="size-4" />
        {actionLabel}
      </button>
      {actionsOpen && (
        <OverlayPortal>
          <div
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) close();
            }}
            className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4 bo-modal-backdrop"
          >
            <section
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="bulk-actions-title"
              aria-describedby="bulk-actions-description"
              aria-busy={busy}
              tabIndex={-1}
              className="w-full max-w-md rounded-md border border-line bg-surface shadow-2xl outline-none bo-modal-card"
            >
              <header className="flex items-center justify-between border-b border-line px-5 py-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-brand">
                    Массовые действия
                  </p>
                  <h2 id="bulk-actions-title" className="mt-1 text-lg font-semibold">
                    {dialogTitle ?? "Действия с " + entityName}
                  </h2>
                  <p id="bulk-actions-description" className="mt-1 text-sm text-copy-muted">
                    Выбрано: {selectedCount}
                  </p>
                </div>
                <button
                  type="button"
                  data-modal-initial-focus
                  aria-label="Закрыть"
                  disabled={busy}
                  onClick={close}
                  className="grid size-9 place-items-center rounded-md text-copy-muted hover:bg-surface-raised hover:text-copy disabled:opacity-40"
                >
                  <IconX className="size-5" />
                </button>
              </header>
              <div className="space-y-2 p-5">
                {onActivate && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(onActivate)}
                    className="bo-bulk-action-card"
                  >
                    <IconCheck className="size-5 text-emerald-300" />
                    <span>
                      <strong>Активировать</strong>
                      <small>Сделать выбранные элементы доступными.</small>
                    </span>
                  </button>
                )}
                {onDeactivate && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(onDeactivate)}
                    className="bo-bulk-action-card"
                  >
                    <IconX className="size-5 text-copy-muted" />
                    <span>
                      <strong>Деактивировать</strong>
                      <small>Скрыть выбранные элементы из каталога.</small>
                    </span>
                  </button>
                )}
                {additionalActions}
                {onDelete && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove()}
                    className="bo-bulk-action-card border-red-500/30 text-red-200 hover:border-red-400/60 hover:bg-red-500/10"
                  >
                    <IconTrash className="size-5" />
                    <span>
                      <strong>Удалить</strong>
                      <small className="text-red-300/70">
                        Безвозвратно удалить выбранные элементы.
                      </small>
                    </span>
                  </button>
                )}
              </div>
            </section>
          </div>
        </OverlayPortal>
      )}
    </div>
  );
}

function OverlayPortal({ children }: { children: ReactNode }) {
  return typeof document === "undefined" ? null : createPortal(children, document.body);
}
