"use client";

import { IconArrowLeft, IconArrowRight, IconCheck, IconPhoto, IconX } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { ProductImage } from "@/components/product-image";
import { previewProductImage } from "@/lib/backoffice-api";
import { useModalAccessibility } from "@/lib/use-modal-accessibility";

type Step = "source" | "processing" | "preview";

export function ProductImageEditorDialog({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (image: { file: File; processed: Blob }) => void;
}) {
  const [step, setStep] = useState<Step>("source");
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [processed, setProcessed] = useState<Blob | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(dialogRef, onClose);

  useEffect(
    () => () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      if (processedUrl) URL.revokeObjectURL(processedUrl);
    },
    [processedUrl, sourceUrl],
  );

  const chooseFile = (nextFile: File | null) => {
    if (!nextFile) return;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (processedUrl) URL.revokeObjectURL(processedUrl);
    setFile(nextFile);
    setSourceUrl(URL.createObjectURL(nextFile));
    setProcessed(null);
    setProcessedUrl(null);
    setError("");
  };
  const processImage = async () => {
    if (!file) return;
    setStep("processing");
    setError("");
    try {
      const nextProcessed = await previewProductImage(file);
      setProcessed(nextProcessed);
      setProcessedUrl(URL.createObjectURL(nextProcessed));
      setStep("preview");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось обработать изображение.");
      setStep("source");
    }
  };
  const confirm = () => {
    if (!file || !processed) return;
    onConfirm({ file, processed });
    onClose();
  };

  return (
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && step !== "processing") onClose();
      }}
      className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4 bo-modal-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-image-editor-title"
        aria-busy={step === "processing"}
        tabIndex={-1}
        className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-md border border-line bg-surface shadow-2xl outline-none bo-modal-card"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-4">
          <div>
            <h2 id="product-image-editor-title" className="text-xl font-medium">
              Новое фото товара
            </h2>
            <p className="mt-1 text-sm text-copy-muted">
              Фон и края гидроцилиндра обрабатываются автоматически.
            </p>
          </div>
          <button
            type="button"
            disabled={step === "processing"}
            onClick={onClose}
            aria-label="Закрыть"
            className="grid size-9 place-items-center text-copy-muted hover:text-brand disabled:opacity-40"
          >
            <IconX className="size-5" />
          </button>
        </div>

        <ol className="flex gap-2 border-b border-line px-5 py-3 text-xs text-copy-muted">
          <li className={step === "source" ? "font-medium text-brand" : undefined}>1. Фото</li>
          <li className={step !== "source" ? "font-medium text-brand" : undefined}>2. Обработка</li>
        </ol>

        <div className="p-5 sm:p-6">
          {step === "source" ? (
            <>
              <label className="grid min-h-64 cursor-pointer place-items-center rounded-md border border-dashed border-line bg-field p-6 text-center hover:border-brand">
                <span>
                  <IconPhoto className="mx-auto size-10 text-copy-muted" />
                  <span className="mt-4 block font-medium">
                    {file ? "Выбрать другое фото" : "Выберите фотографию"}
                  </span>
                  <span className="mt-2 block text-sm text-copy-muted">
                    {file ? file.name : "JPG, PNG или WebP, до 8 МБ"}
                  </span>
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
                  className="sr-only"
                />
              </label>
              {error ? (
                <p role="alert" className="mt-3 text-sm text-brand">
                  {error}
                </p>
              ) : null}
            </>
          ) : null}

          {step === "processing" ? (
            <div className="grid min-h-64 place-items-center text-center">
              <div>
                <div className="mx-auto h-1.5 w-64 overflow-hidden rounded-full bg-surface-raised">
                  <div className="h-full w-2/3 animate-pulse rounded-full bg-brand" />
                </div>
                <p className="mt-5 font-medium">Обрабатываем фотографию…</p>
                <p className="mt-2 text-sm text-copy-muted">
                  Удаляем фон, подрезаем прозрачные края и готовим WebP.
                </p>
              </div>
            </div>
          ) : null}

          {step === "preview" && sourceUrl && processedUrl ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <ImageComparison label="До обработки" src={sourceUrl} />
              <ImageComparison label="После обработки" src={processedUrl} transparent />
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 flex justify-between gap-3 border-t border-line bg-surface px-5 py-4">
          <button
            type="button"
            disabled={step === "processing"}
            onClick={() => (step === "preview" ? setStep("source") : onClose())}
            className="inline-flex h-10 items-center gap-2 px-3 text-sm text-copy-muted hover:text-brand disabled:opacity-40"
          >
            <IconArrowLeft className="size-4" /> Назад
          </button>
          {step === "source" ? (
            <button
              type="button"
              disabled={!file}
              onClick={() => void processImage()}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm text-white disabled:opacity-40"
            >
              Далее <IconArrowRight className="size-4" />
            </button>
          ) : null}
          {step === "preview" ? (
            <button
              type="button"
              onClick={confirm}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm text-white"
            >
              <IconCheck className="size-4" /> Сохранить фото
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ImageComparison({
  label,
  src,
  transparent = false,
}: {
  label: string;
  src: string;
  transparent?: boolean;
}) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-medium">{label}</h3>
      <div
        className={`aspect-square rounded-md border border-line p-4 ${transparent ? "bg-[linear-gradient(45deg,#e2e8f0_25%,transparent_25%,transparent_75%,#e2e8f0_75%),linear-gradient(45deg,#e2e8f0_25%,transparent_25%,transparent_75%,#e2e8f0_75%)] bg-[length:20px_20px] bg-[position:0_0,10px_10px]" : "bg-slate-100"}`}
      >
        <ProductImage
          src={src}
          alt={label}
          width={600}
          height={600}
          className="size-full object-contain"
        />
      </div>
    </section>
  );
}
