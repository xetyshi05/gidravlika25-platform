"use client";

import { IconCheck, IconCopy, IconKey, IconX } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { regenerateRecoveryCodes, type RecoveryCodesActionResult } from "@/app/auth-actions";
import { useModalAccessibility } from "@/lib/use-modal-accessibility";

export function RecoveryCodesDialog() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<RecoveryCodesActionResult | null>(null);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const close = () => {
    if (pending) return;
    setOpen(false);
    setResult(null);
    setCopied(false);
  };
  useModalAccessibility(dialogRef, close, open);

  const regenerate = async () => {
    setPending(true);
    setResult(null);
    setCopied(false);
    try {
      setResult(await regenerateRecoveryCodes());
    } finally {
      setPending(false);
    }
  };

  const copyCodes = async (codes: string[]) => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Перевыпустить резервные коды"
        title="Резервные коды"
        className="grid size-9 shrink-0 place-items-center text-slate-500 transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-brand"
      >
        <IconKey className="size-5" aria-hidden="true" />
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
            aria-labelledby="crm-recovery-codes-title"
            aria-describedby="crm-recovery-codes-description"
            aria-busy={pending}
            tabIndex={-1}
            className="crm-modal-panel relative max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto border border-slate-200 bg-white p-6 shadow-xl outline-none"
          >
            <button
              type="button"
              onClick={close}
              disabled={pending}
              aria-label="Закрыть"
              className="absolute right-4 top-4 grid size-9 place-items-center text-slate-500 hover:text-brand disabled:opacity-40"
            >
              <IconX className="size-5" />
            </button>
            <div className="flex items-center gap-3 pr-12">
              <span className="grid size-10 shrink-0 place-items-center bg-red-50 text-brand">
                <IconKey className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h2 id="crm-recovery-codes-title" className="text-xl font-black text-slate-950">
                  Резервные коды
                </h2>
                <p id="crm-recovery-codes-description" className="mt-1 text-sm text-slate-500">
                  Коды для входа, если приложение-аутентификатор недоступно.
                </p>
              </div>
            </div>

            {result?.ok ? (
              <>
                <p className="mt-6 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Сохраните новый набор сейчас. Повторно показать его нельзя, а прежние коды уже
                  аннулированы.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm text-slate-950">
                  {result.recoveryCodes.map((code) => (
                    <code key={code} className="border border-slate-200 bg-slate-50 px-3 py-2">
                      {code}
                    </code>
                  ))}
                </div>
                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => void copyCodes(result.recoveryCodes)}
                    className="inline-flex min-h-10 items-center gap-2 border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:border-brand hover:text-brand"
                  >
                    {copied ? <IconCheck className="size-4" /> : <IconCopy className="size-4" />}
                    {copied ? "Скопировано" : "Скопировать"}
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    data-modal-initial-focus
                    className="min-h-10 bg-brand px-4 text-sm font-bold text-white hover:bg-brand-dark"
                  >
                    Я сохранил коды
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-6 text-sm leading-6 text-slate-700">
                  После перевыпуска все старые резервные коды перестанут работать. Новый набор будет
                  показан только в этом окне.
                </p>
                {result && !result.ok ? (
                  <p
                    role="alert"
                    className="mt-4 border border-red-200 bg-red-50 p-3 text-sm text-brand"
                  >
                    {result.message}
                  </p>
                ) : null}
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={close}
                    disabled={pending}
                    className="min-h-10 border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:border-brand hover:text-brand disabled:opacity-40"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={() => void regenerate()}
                    disabled={pending}
                    data-modal-initial-focus
                    className="min-h-10 bg-brand px-4 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-60"
                  >
                    {pending ? "Перевыпускаем…" : "Перевыпустить"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
