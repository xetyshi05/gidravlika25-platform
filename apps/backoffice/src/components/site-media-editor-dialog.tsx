"use client";

/* eslint-disable @next/next/no-img-element */
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconCrop,
  IconPhoto,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  cropSiteMedia,
  replaceSiteMedia,
  siteMediaSourcePath,
  uploadSiteMedia,
  type SiteMedia,
  type SiteMediaCrop,
} from "@/lib/backoffice-api";
import { useModalAccessibility } from "@/lib/use-modal-accessibility";

type GalleryKind = "HERO" | "GALLERY" | "MAIN_GALLERY";
type Step = "choice" | "source" | "crop" | "preview";
type CropTransform = { zoom: number; panX: number; panY: number };

const cropSettings: Record<GalleryKind, { aspect: number; description: string }> = {
  HERO: { aspect: 1920 / 900, description: "Формат главного баннера" },
  MAIN_GALLERY: { aspect: 3 / 2, description: "Формат галереи на главной" },
  GALLERY: { aspect: 4 / 3, description: "Формат галереи производства" },
};

export function SiteMediaEditorDialog({
  kind,
  item,
  onClose,
  onCompleted,
}: {
  kind: GalleryKind;
  item?: SiteMedia;
  onClose: () => void;
  onCompleted: () => Promise<void> | void;
}) {
  const [step, setStep] = useState<Step>(item ? "choice" : "source");
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<SiteMediaCrop | null>(null);
  const [transform, setTransform] = useState<CropTransform>({ zoom: 1, panX: 0, panY: 0 });
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const close = () => {
    if (!saving) onClose();
  };
  useModalAccessibility(dialogRef, close);

  useEffect(
    () => () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    },
    [fileUrl],
  );

  const settings = cropSettings[kind];
  const source = fileUrl ?? (item ? siteMediaSourcePath(item.id) : null);
  const alt = useMemo(
    () => file?.name.replace(/\.[^.]+$/, "").trim() || item?.alt || "Фотография",
    [file?.name, item?.alt],
  );
  const chooseFile = (nextFile: File | null) => {
    if (!nextFile) return;
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFile(nextFile);
    setFileUrl(URL.createObjectURL(nextFile));
    setCrop(null);
    setTransform({ zoom: 1, panX: 0, panY: 0 });
  };
  const save = async () => {
    if (!crop || saving) return;
    setSaving(true);
    try {
      if (item && !file) await cropSiteMedia(item.id, crop);
      else if (item && file) await replaceSiteMedia(item.id, file, crop);
      else if (file) await uploadSiteMedia({ file, kind, alt, title: "", crop });
      else return;
      await onCompleted();
      window.dispatchEvent(
        new CustomEvent("backoffice:notice", {
          detail: item ? "Изображение обновлено" : "Изображение опубликовано",
        }),
      );
      onClose();
    } catch (cause) {
      window.dispatchEvent(
        new CustomEvent("backoffice:notice", {
          detail: cause instanceof Error ? cause.message : "Не удалось сохранить изображение.",
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  const title = item ? "Редактирование фото" : "Добавление фото";
  return (
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4 bo-modal-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="site-media-editor-title"
        aria-busy={saving}
        tabIndex={-1}
        className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-md border border-line bg-surface shadow-2xl outline-none bo-modal-card"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-4">
          <div>
            <h2 id="site-media-editor-title" className="text-xl font-medium">
              {title}
            </h2>
            <p className="mt-1 text-sm text-copy-muted">{settings.description}</p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={close}
            aria-label="Закрыть"
            className="grid size-9 place-items-center text-copy-muted hover:text-brand disabled:opacity-40"
          >
            <IconX className="size-5" />
          </button>
        </div>

        {step !== "choice" ? <StepIndicator step={step} existing={Boolean(item)} /> : null}

        <div className="p-5 sm:p-6">
          {step === "choice" && item ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {item.hasOriginal ? (
                <button
                  type="button"
                  onClick={() => setStep("crop")}
                  className="rounded-md border border-line p-5 text-left transition-colors hover:border-brand hover:bg-brand/5"
                >
                  <IconCrop className="size-6 text-brand" />
                  <p className="mt-4 font-medium">Редактировать существующее</p>
                  <p className="mt-1 text-sm leading-6 text-copy-muted">
                    Изменить кадр из сохранённого оригинала без потери качества.
                  </p>
                </button>
              ) : (
                <div className="rounded-md border border-dashed border-line p-5 text-sm leading-6 text-copy-muted">
                  Для этого ранее загруженного фото оригинал не сохранён. Чтобы не кадрировать
                  сжатый WebP повторно, его можно только заменить новым файлом.
                </div>
              )}
              <button
                type="button"
                onClick={() => setStep("source")}
                className="rounded-md border border-line p-5 text-left transition-colors hover:border-brand hover:bg-brand/5"
              >
                <IconUpload className="size-6 text-brand" />
                <p className="mt-4 font-medium">Заменить на новое</p>
                <p className="mt-1 text-sm leading-6 text-copy-muted">
                  Загрузить другое фото, кадрировать и опубликовать его вместо текущего.
                </p>
              </button>
            </div>
          ) : null}

          {step === "source" ? (
            <label className="grid min-h-64 cursor-pointer place-items-center rounded-md border border-dashed border-line bg-field p-6 text-center transition-colors hover:border-brand">
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
          ) : null}

          {step === "crop" && source ? (
            <>
              <CropWorkspace
                src={source}
                alt={alt}
                aspect={settings.aspect}
                transform={transform}
                onTransform={setTransform}
                onCropChange={setCrop}
              />
              <p className="mt-4 text-sm text-copy-muted">
                Потяните фотографию, чтобы выбрать кадр. Масштаб меняется ползунком; пропорция
                фиксирована для этого раздела.
              </p>
            </>
          ) : null}

          {step === "preview" && source ? (
            <>
              <CropWorkspace
                src={source}
                alt={alt}
                aspect={settings.aspect}
                transform={transform}
                readOnly
              />
              <p className="mt-4 text-sm text-copy-muted">
                Так изображение будет выглядеть на сайте после обработки и перевода в WebP.
              </p>
            </>
          ) : null}
        </div>

        <div className="sticky bottom-0 flex flex-wrap justify-between gap-3 border-t border-line bg-surface px-5 py-4">
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              if (step === "crop") setStep(item && !file ? "choice" : "source");
              else if (step === "preview") setStep("crop");
              else close();
            }}
            className="inline-flex h-10 items-center gap-2 px-3 text-sm text-copy-muted hover:text-brand disabled:opacity-40"
          >
            <IconArrowLeft className="size-4" /> Назад
          </button>
          {step === "crop" ? (
            <button
              type="button"
              disabled={!crop}
              onClick={() => setStep("preview")}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm text-white disabled:opacity-40"
            >
              Далее <IconArrowRight className="size-4" />
            </button>
          ) : null}
          {step === "source" ? (
            <button
              type="button"
              disabled={!file}
              onClick={() => setStep("crop")}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm text-white disabled:opacity-40"
            >
              Далее <IconArrowRight className="size-4" />
            </button>
          ) : null}
          {step === "preview" ? (
            <button
              type="button"
              disabled={!crop || saving}
              onClick={() => void save()}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm text-white disabled:opacity-40"
            >
              <IconCheck className="size-4" /> {saving ? "Сохраняем…" : "Подтвердить"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ step, existing }: { step: Step; existing: boolean }) {
  const steps = existing
    ? ["Кадрирование", "Предпросмотр"]
    : ["Фото", "Кадрирование", "Предпросмотр"];
  const current = step === "source" ? 0 : step === "crop" ? (existing ? 0 : 1) : steps.length - 1;
  return (
    <ol className="flex gap-2 border-b border-line px-5 py-3 text-xs text-copy-muted sm:px-6">
      {steps.map((label, index) => (
        <li key={label} className={index === current ? "font-medium text-brand" : undefined}>
          {index + 1}. {label}
        </li>
      ))}
    </ol>
  );
}

function CropWorkspace({
  src,
  alt,
  aspect,
  transform,
  onTransform,
  onCropChange,
  readOnly = false,
}: {
  src: string;
  alt: string;
  aspect: number;
  transform: CropTransform;
  onTransform?: (next: CropTransform) => void;
  onCropChange?: (crop: SiteMediaCrop) => void;
  readOnly?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [error, setError] = useState(false);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const update = () => setViewport({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const rendered = useMemo(() => {
    if (!natural || !viewport.width || !viewport.height) return null;
    const baseScale = Math.max(viewport.width / natural.width, viewport.height / natural.height);
    const scale = baseScale * transform.zoom;
    const width = natural.width * scale;
    const height = natural.height * scale;
    const maxX = Math.max(0, (width - viewport.width) / 2);
    const maxY = Math.max(0, (height - viewport.height) / 2);
    const offsetX = Math.max(-1, Math.min(1, transform.panX)) * maxX;
    const offsetY = Math.max(-1, Math.min(1, transform.panY)) * maxY;
    const left = (viewport.width - width) / 2 + offsetX;
    const top = (viewport.height - height) / 2 + offsetY;
    const cropWidth = viewport.width / scale;
    const cropHeight = viewport.height / scale;
    return {
      width,
      height,
      offsetX,
      offsetY,
      maxX,
      maxY,
      crop: {
        x: Math.max(0, Math.min(natural.width - cropWidth, -left / scale)) / natural.width,
        y: Math.max(0, Math.min(natural.height - cropHeight, -top / scale)) / natural.height,
        width: cropWidth / natural.width,
        height: cropHeight / natural.height,
      },
    };
  }, [natural, transform, viewport]);

  useEffect(() => {
    if (rendered) onCropChange?.(rendered.crop);
  }, [onCropChange, rendered]);

  return (
    <div>
      <div
        ref={viewportRef}
        onPointerDown={(event) => {
          if (readOnly || !rendered || !onTransform) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            x: event.clientX,
            y: event.clientY,
            panX: transform.panX,
            panY: transform.panY,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || !rendered || !onTransform) return;
          onTransform({
            ...transform,
            panX: rendered.maxX
              ? Math.max(-1, Math.min(1, drag.panX + (event.clientX - drag.x) / rendered.maxX))
              : 0,
            panY: rendered.maxY
              ? Math.max(-1, Math.min(1, drag.panY + (event.clientY - drag.y) / rendered.maxY))
              : 0,
          });
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        className={`relative mx-auto w-full max-w-2xl overflow-hidden rounded-md bg-black ${readOnly ? "" : "cursor-grab touch-none active:cursor-grabbing"}`}
        style={{ aspectRatio: String(aspect) }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={(event) =>
            setNatural({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })
          }
          onError={() => setError(true)}
          className="absolute max-w-none select-none"
          style={
            rendered
              ? {
                  width: rendered.width,
                  height: rendered.height,
                  left: "50%",
                  top: "50%",
                  transform: `translate(-50%, -50%) translate(${rendered.offsetX}px, ${rendered.offsetY}px)`,
                }
              : { visibility: "hidden" }
          }
        />
        {!natural && !error ? (
          <p className="grid size-full place-items-center text-sm text-white/75">Загружаем фото…</p>
        ) : null}
        {error ? (
          <p className="grid size-full place-items-center p-6 text-center text-sm text-white/75">
            Не удалось открыть изображение.
          </p>
        ) : null}
      </div>
      {!readOnly ? (
        <label className="mx-auto mt-4 flex max-w-2xl items-center gap-3 text-sm text-copy-muted">
          Масштаб
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={transform.zoom}
            onChange={(event) => onTransform?.({ ...transform, zoom: Number(event.target.value) })}
            className="accent-brand"
          />
        </label>
      ) : null}
    </div>
  );
}
