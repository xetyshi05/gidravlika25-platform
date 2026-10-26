"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useModalAccessibility } from "@/lib/use-modal-accessibility";

type ConfirmationOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: "danger" | "primary";
};
type PendingConfirmation = ConfirmationOptions & { resolve: (confirmed: boolean) => void };

const ConfirmationContext = createContext<
  ((options: ConfirmationOptions) => Promise<boolean>) | null
>(null);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const confirm = useCallback(
    (options: ConfirmationOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...options, resolve });
      }),
    [],
  );
  const close = useCallback((confirmed: boolean) => {
    setPending((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);
  return (
    <ConfirmationContext.Provider value={confirm}>
      {children}
      {pending ? <ConfirmationDialog {...pending} onClose={close} /> : null}
    </ConfirmationContext.Provider>
  );
}

export function useConfirmation() {
  const confirm = useContext(ConfirmationContext);
  if (!confirm) throw new Error("useConfirmation must be used inside ConfirmationProvider.");
  return confirm;
}

function ConfirmationDialog({
  title,
  description,
  confirmLabel = "Подтвердить",
  tone = "danger",
  onClose,
}: PendingConfirmation & { onClose: (confirmed: boolean) => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(dialogRef, () => onClose(false));
  return (
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose(false);
      }}
      className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 bo-modal-backdrop"
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmation-dialog-title"
        aria-describedby={description ? "confirmation-dialog-description" : undefined}
        tabIndex={-1}
        className="w-full max-w-md rounded-md border border-line bg-surface p-6 shadow-2xl outline-none bo-modal-card"
      >
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand/10 text-brand">
            <IconAlertTriangle className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="confirmation-dialog-title" className="text-lg font-semibold text-copy">
              {title}
            </h2>
            {description ? (
              <p
                id="confirmation-dialog-description"
                className="mt-2 text-sm leading-6 text-copy-muted"
              >
                {description}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="h-10 px-4 text-sm text-copy-muted hover:text-copy"
          >
            Отмена
          </button>
          <button
            type="button"
            data-modal-initial-focus=""
            onClick={() => onClose(true)}
            className={`h-10 rounded-md px-4 text-sm text-white ${tone === "danger" ? "bg-brand hover:bg-brand-dark" : "bg-copy hover:bg-copy-muted"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
