"use client";

import { useRef, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { CustomProductionForm } from "@/components/home/custom-production-form";
import { useModalAccessibility } from "@/lib/use-modal-accessibility";

type CustomProductionRequestModalProps = {
  buttonLabel?: string;
  triggerClassName?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  requestKind?: "custom" | "wholesale";
  initialComment?: string;
};

export function CustomProductionRequestModal({
  buttonLabel = "Оставить заявку",
  triggerClassName = "mt-8 bg-brand px-5 text-white hover:bg-brand-dark",
  eyebrow,
  title,
  description,
  requestKind,
  initialComment,
}: CustomProductionRequestModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const closeModal = () => {
    if (isClosing) return;

    setIsClosing(true);
    window.setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 220);
  };

  useModalAccessibility(dialogRef, closeModal, isOpen);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`inline-flex min-h-12 cursor-pointer items-center justify-center text-sm font-bold transition-colors duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand ${triggerClassName}`}
      >
        {buttonLabel}
      </button>

      {isOpen ? (
        <div
          className={`${isClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"} fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 sm:p-6`}
          role="presentation"
          onMouseDown={closeModal}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="custom-production-form-title"
            aria-describedby="custom-production-form-description"
            tabIndex={-1}
            className={`${isClosing ? "modal-dialog-exit" : "modal-dialog-enter"} relative max-h-[calc(100dvh-2rem)] w-full max-w-4xl overflow-y-auto rounded bg-white p-5 outline-none sm:max-h-[calc(100dvh-3rem)] sm:p-8`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeModal}
              className="absolute right-5 top-5 grid size-10 cursor-pointer place-items-center rounded text-slate-500 transition-colors duration-200 ease-out hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:right-8 sm:top-8"
              aria-label="Закрыть форму"
            >
              <IconX className="size-5" aria-hidden="true" />
            </button>
            <CustomProductionForm
              eyebrow={eyebrow}
              title={title}
              description={description}
              requestKind={requestKind}
              initialComment={initialComment}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
