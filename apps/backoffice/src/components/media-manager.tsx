"use client";

import {
  IconDotsVertical,
  IconEye,
  IconEyeOff,
  IconRefresh,
  IconPencil,
  IconPhoto,
  IconPlus,
  IconTrash,
  IconUpload,
  IconAlertTriangle,
  IconCircleCheck,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { CustomSelect } from "@/components/ui";
import { ImagePreviewDialog } from "@/components/image-preview-dialog";
import { ProductImage } from "@/components/product-image";
import { SiteMediaEditorDialog } from "@/components/site-media-editor-dialog";
import { useConfirmation } from "@/components/confirmation-dialog";
import {
  deleteSiteMedia,
  getMediaStorageStatus,
  getSiteMedia,
  importCatalogImageOriginals,
  importSiteMediaOriginals,
  synchronizeOriginalsFromStorage,
  updateSiteMedia,
  type MediaStorageGroupStatus,
  type MediaStorageStatus,
  type OriginalsImportProgress,
  type SiteMedia,
} from "@/lib/backoffice-api";

export function MediaManager() {
  const confirm = useConfirmation();
  const [items, setItems] = useState<SiteMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageStatus, setStorageStatus] = useState<MediaStorageStatus | null>(null);
  const [storageStatusLoading, setStorageStatusLoading] = useState(true);
  const [storageStatusError, setStorageStatusError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{
    target: "site" | "catalog";
    done: number;
    total: number;
  } | null>(null);
  const importingOriginals = importProgress !== null;
  const [synchronizingOriginals, setSynchronizingOriginals] = useState(false);
  const [dragged, setDragged] = useState<SiteMedia | null>(null);
  const [preview, setPreview] = useState<SiteMedia | null>(null);
  const [editor, setEditor] = useState<{
    kind: "HERO" | "GALLERY" | "MAIN_GALLERY";
    item?: SiteMedia;
  } | null>(null);
  const refreshStorageStatus = async () => {
    setStorageStatusLoading(true);
    setStorageStatusError(null);
    try {
      setStorageStatus(await getMediaStorageStatus());
    } catch (cause) {
      setStorageStatusError(
        cause instanceof Error ? cause.message : "Не удалось проверить хранилища.",
      );
    } finally {
      setStorageStatusLoading(false);
    }
  };
  const load = async () => {
    setItems(await getSiteMedia());
    void refreshStorageStatus();
  };
  const importOriginals = async (files: File[], target: "site" | "catalog") => {
    if (!files.length || importingOriginals) return;
    let done = 0;
    const onProgress = (progress: OriginalsImportProgress) => {
      done = progress.done;
      setImportProgress({ target, ...progress });
    };
    setImportProgress({ target, done: 0, total: files.length });
    try {
      const result =
        target === "site"
          ? await importSiteMediaOriginals(files, onProgress)
          : await importCatalogImageOriginals(files, onProgress);
      const skipped = result.notMatched.length + result.duplicates.length;
      const unresolved = [...result.notMatched, ...result.duplicates].slice(0, 3);
      window.dispatchEvent(
        new CustomEvent("backoffice:notice", {
          detail:
            `${target === "site" ? "Фото сайта" : "Каталог"}: загружено — ${result.imported}, ` +
            `уже на сервере — ${result.alreadyPresent}.` +
            (skipped
              ? ` Не сопоставлено — ${skipped}${unresolved.length ? `: ${unresolved.join(", ")}` : ""}.`
              : "") +
            (result.ambiguous.length
              ? ` Неоднозначно — ${result.ambiguous.length}: ${result.ambiguous.slice(0, 3).join(", ")}` +
                (target === "catalog"
                  ? " (имя файла должно совпадать с артикулом с учётом регистра)."
                  : ".")
              : ""),
        }),
      );
    } catch (cause) {
      window.dispatchEvent(
        new CustomEvent("backoffice:notice", {
          detail:
            `${cause instanceof Error ? cause.message : "Не удалось загрузить оригиналы."} ` +
            `Обработано до ошибки: ${done} из ${files.length}.`,
        }),
      );
    } finally {
      setImportProgress(null);
      setItems(await getSiteMedia().catch(() => items));
      void refreshStorageStatus();
    }
  };
  const synchronizeOriginals = async () => {
    if (synchronizingOriginals) return;
    setSynchronizingOriginals(true);
    try {
      const result = await synchronizeOriginalsFromStorage();
      await load();
      window.dispatchEvent(
        new CustomEvent("backoffice:notice", {
          detail:
            `Связано оригиналов на сервере: ${result.linked}. Уже связаны: ${result.alreadyLinked}.` +
            (result.ambiguous.length
              ? ` Требуют ручной проверки (несколько расширений или файл уже связан с другим товаром): ${result.ambiguous.slice(0, 3).join(", ")}.`
              : ""),
        }),
      );
    } catch (cause) {
      window.dispatchEvent(
        new CustomEvent("backoffice:notice", {
          detail: cause instanceof Error ? cause.message : "Не удалось синхронизировать оригиналы.",
        }),
      );
    } finally {
      setSynchronizingOriginals(false);
    }
  };
  useEffect(() => {
    let active = true;
    void getSiteMedia()
      .then((media) => {
        if (active) setItems(media);
      })
      .catch((cause: unknown) =>
        window.dispatchEvent(
          new CustomEvent("backoffice:notice", {
            detail: cause instanceof Error ? cause.message : "Не удалось загрузить медиафайлы.",
          }),
        ),
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    void getMediaStorageStatus()
      .then((status) => {
        if (active) setStorageStatus(status);
      })
      .catch((cause: unknown) => {
        if (active)
          setStorageStatusError(
            cause instanceof Error ? cause.message : "Не удалось проверить хранилища.",
          );
      })
      .finally(() => {
        if (active) setStorageStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const remove = async (id: string) => {
    if (
      !(await confirm({
        title: "Удалить изображение?",
        description: "Фото будет удалено из галереи и публичного хранилища.",
        confirmLabel: "Удалить",
      }))
    )
      return;
    try {
      await deleteSiteMedia(id);
      await load();
    } catch (cause) {
      window.dispatchEvent(
        new CustomEvent("backoffice:notice", {
          detail: cause instanceof Error ? cause.message : "Не удалось удалить изображение.",
        }),
      );
    }
  };
  const update = async (
    id: string,
    input: {
      isActive?: boolean;
      kind?: "GALLERY" | "MAIN_GALLERY";
      position?: number;
    },
  ) => {
    try {
      setItems(await updateSiteMedia(id, input));
    } catch (cause) {
      window.dispatchEvent(
        new CustomEvent("backoffice:notice", {
          detail: cause instanceof Error ? cause.message : "Не удалось обновить изображение.",
        }),
      );
    }
  };
  const drop = async (targetKind: "GALLERY" | "MAIN_GALLERY", position: number) => {
    if (!dragged) return;
    if (dragged.kind !== targetKind) return;
    setDragged(null);
    await update(dragged.id, { kind: targetKind, position });
  };
  const hero = items.find((item) => item.kind === "HERO");
  const gallery = items.filter((item) => item.kind === "GALLERY");
  const mainGallery = items.filter((item) => item.kind === "MAIN_GALLERY");
  return (
    <div className="grid gap-8">
      <MediaStorageStatusPanel
        status={storageStatus}
        loading={storageStatusLoading}
        error={storageStatusError}
        onRefresh={() => void refreshStorageStatus()}
        onImportSite={(files) => void importOriginals(files, "site")}
        onImportCatalog={(files) => void importOriginals(files, "catalog")}
        importing={importingOriginals}
        importProgress={importProgress}
        onSynchronizeOriginals={() => void synchronizeOriginals()}
        synchronizingOriginals={synchronizingOriginals}
      />
      <MediaGroup
        title="Главное фото"
        items={hero ? [hero] : []}
        loading={loading}
        onEdit={(item) => setEditor({ kind: item.kind, item })}
        onPreview={setPreview}
      />
      <MediaGroup
        title="Галерея на главной"
        kind="MAIN_GALLERY"
        items={mainGallery}
        loading={loading}
        dragged={dragged}
        onDrag={setDragged}
        onDrop={drop}
        onDelete={remove}
        onEdit={(item) => setEditor({ kind: item.kind, item })}
        onPreview={setPreview}
        onAdd={(kind) => setEditor({ kind })}
        onToggle={(item) => void update(item.id, { isActive: !item.isActive })}
      />
      <MediaGroup
        title="Галерея производства"
        kind="GALLERY"
        items={gallery}
        loading={loading}
        dragged={dragged}
        onDrag={setDragged}
        onDrop={drop}
        onDelete={remove}
        onEdit={(item) => setEditor({ kind: item.kind, item })}
        onPreview={setPreview}
        onAdd={(kind) => setEditor({ kind })}
        onToggle={(item) => void update(item.id, { isActive: !item.isActive })}
      />
      {preview?.imagePath ? (
        <ImagePreviewDialog
          src={preview.imagePath}
          alt={preview.title || preview.alt}
          onClose={() => setPreview(null)}
        />
      ) : null}
      {editor ? (
        <SiteMediaEditorDialog
          kind={editor.kind}
          item={editor.item}
          onClose={() => setEditor(null)}
          onCompleted={load}
        />
      ) : null}
    </div>
  );
}

function MediaStorageStatusPanel({
  status,
  loading,
  error,
  onRefresh,
  onImportSite,
  onImportCatalog,
  importing,
  importProgress,
  onSynchronizeOriginals,
  synchronizingOriginals,
}: {
  status: MediaStorageStatus | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onImportSite: (files: File[]) => void;
  onImportCatalog: (files: File[]) => void;
  importing: boolean;
  importProgress: { target: "site" | "catalog"; done: number; total: number } | null;
  onSynchronizeOriginals: () => void;
  synchronizingOriginals: boolean;
}) {
  const siteInputRef = useRef<HTMLInputElement>(null);
  const catalogInputRef = useRef<HTMLInputElement>(null);
  return (
    <section className="rounded-md border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Синхронизация хранилищ</h2>
          <p className="mt-1 text-sm text-copy-muted">
            Оригиналы хранятся приватно на сервере, подготовленные WebP — в S3.
          </p>
          <p className="mt-1 text-sm text-copy-muted">
            Для синхронизации с сервером: каталог — артикул, сайт — main-1, about-N и gallery-N.
          </p>
          <p className="mt-1 text-sm text-copy-muted">
            Файлы из S3 без записи в базе при синхронизации добавляются скрытыми — включите их
            вручную.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={siteInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            // Opened by the button next to it: no separate unlabeled tab stop.
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.currentTarget.value = "";
              onImportSite(files);
            }}
          />
          <button
            type="button"
            onClick={() => siteInputRef.current?.click()}
            disabled={importing}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm hover:border-brand hover:text-brand disabled:cursor-wait disabled:opacity-60"
          >
            <IconUpload className={`size-4 ${importing ? "animate-pulse" : ""}`} />
            {importProgress?.target === "site"
              ? `Загружено ${importProgress.done} из ${importProgress.total}…`
              : "Загрузить оригиналы фото сайта"}
          </button>
          <input
            ref={catalogInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            // Opened by the button next to it: no separate unlabeled tab stop.
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.currentTarget.value = "";
              onImportCatalog(files);
            }}
          />
          <button
            type="button"
            onClick={() => catalogInputRef.current?.click()}
            disabled={importing}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm hover:border-brand hover:text-brand disabled:cursor-wait disabled:opacity-60"
          >
            <IconUpload className={`size-4 ${importing ? "animate-pulse" : ""}`} />
            {importProgress?.target === "catalog"
              ? `Загружено ${importProgress.done} из ${importProgress.total}…`
              : "Загрузить оригиналы каталога"}
          </button>
          <button
            type="button"
            onClick={onSynchronizeOriginals}
            disabled={synchronizingOriginals || importing}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm hover:border-brand hover:text-brand disabled:cursor-wait disabled:opacity-60"
          >
            <IconRefresh className={`size-4 ${synchronizingOriginals ? "animate-spin" : ""}`} />
            {synchronizingOriginals ? "Синхронизируем…" : "Синхронизировать с сервером"}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading || importing || synchronizingOriginals}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm hover:border-brand hover:text-brand disabled:cursor-wait disabled:opacity-60"
          >
            <IconRefresh className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Проверить
          </button>
        </div>
      </div>
      {error ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-red-600">
          <IconAlertTriangle className="size-4 shrink-0" />
          {error}
        </p>
      ) : null}
      {status ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <StorageStatusGroup title="Фото сайта" status={status.site} />
          <StorageStatusGroup title="Товары каталога" status={status.catalog} />
        </div>
      ) : loading ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2" aria-label="Проверяем хранилища">
          <div className="h-24 animate-pulse rounded-md bg-field" />
          <div className="h-24 animate-pulse rounded-md bg-field" />
        </div>
      ) : null}
    </section>
  );
}

function StorageStatusGroup({ title, status }: { title: string; status: MediaStorageGroupStatus }) {
  const complete = status.ready === status.total;
  return (
    <div className="rounded-md border border-line bg-field p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{title}</h3>
          <p className="mt-1 text-sm text-copy-muted">
            Оригиналы: {status.originalsPresent} / {status.total} · S3: {status.publicImagesPresent}{" "}
            / {status.total}
          </p>
        </div>
        {complete ? (
          <IconCircleCheck
            className="size-5 shrink-0 text-emerald-600"
            aria-label="Синхронизировано"
          />
        ) : (
          <IconAlertTriangle
            className="size-5 shrink-0 text-amber-600"
            aria-label="Требуется синхронизация"
          />
        )}
      </div>
      <p className={`mt-3 text-sm ${complete ? "text-emerald-700" : "text-amber-700"}`}>
        {complete
          ? "Все файлы на месте."
          : `Не хватает: оригиналов — ${status.missingOriginals}, WebP в S3 — ${status.missingPublicImages}.`}
      </p>
    </div>
  );
}

function MediaGroup({
  title,
  kind,
  items,
  loading = false,
  dragged,
  onDrag,
  onDrop,
  onDelete,
  onEdit,
  onAdd,
  onPreview,
  onToggle,
}: {
  title: string;
  kind?: "GALLERY" | "MAIN_GALLERY";
  items: SiteMedia[];
  loading?: boolean;
  dragged?: SiteMedia | null;
  onDrag?: (item: SiteMedia | null) => void;
  onDrop?: (kind: "GALLERY" | "MAIN_GALLERY", position: number) => void;
  onDelete?: (id: string) => void;
  onEdit?: (item: SiteMedia) => void;
  onAdd?: (kind: "GALLERY" | "MAIN_GALLERY") => void;
  onPreview?: (item: SiteMedia) => void;
  onToggle?: (item: SiteMedia) => void;
}) {
  const interactive = Boolean(kind && onDrag && onDrop && onDelete && onToggle);
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">{title}</h2>
        {kind && onAdd ? (
          <button
            type="button"
            onClick={() => onAdd(kind)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm hover:border-brand hover:text-brand"
          >
            <IconPlus className="size-4" />
            Добавить фото
          </button>
        ) : null}
      </div>
      {loading ? (
        <MediaLoadingCards count={kind ? 3 : 1} />
      ) : items.length ? (
        <div
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          onDragOver={(event) => interactive && event.preventDefault()}
          onDrop={() => interactive && onDrop!(kind!, items.length)}
        >
          {items.map((item, index) => (
            <article
              key={item.id}
              draggable={interactive}
              onDragStart={() => onDrag?.(item)}
              onDragEnd={() => onDrag?.(null)}
              onDragOver={(event) => interactive && event.preventDefault()}
              onDrop={(event) => {
                if (!interactive) return;
                event.stopPropagation();
                onDrop!(kind!, index);
              }}
              className={`relative overflow-hidden rounded-md border border-line bg-surface ${
                dragged?.id === item.id ? "opacity-50" : ""
              } ${interactive ? "cursor-grab" : ""}`}
            >
              <button
                type="button"
                disabled={!item.imagePath}
                onClick={() => onPreview?.(item)}
                aria-label={`Открыть фото «${item.title || item.alt}» в полном размере`}
                className="relative block aspect-video w-full bg-slate-100 disabled:cursor-default"
              >
                <ProductImage
                  src={item.imagePath}
                  alt={item.alt}
                  width={480}
                  height={270}
                  className={`size-full object-cover transition-opacity ${
                    item.isActive ? "" : "opacity-50 grayscale"
                  }`}
                />
              </button>
              <div
                className="absolute right-3 top-3 z-10 w-8"
                onMouseDown={(event) => event.stopPropagation()}
                onDragStart={(event) => event.preventDefault()}
              >
                <MediaActionsSelect
                  item={item}
                  interactive={interactive}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onToggle={onToggle}
                />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div
          className="flex items-center gap-2 rounded-md border border-dashed border-line p-5 text-sm text-copy-muted"
          onDragOver={(event) => interactive && event.preventDefault()}
          onDrop={() => interactive && onDrop!(kind!, 0)}
        >
          <IconPhoto className="size-5" />
          Пока нет изображений.
        </div>
      )}
    </section>
  );
}

function MediaActionsSelect({
  item,
  interactive,
  onEdit,
  onDelete,
  onToggle,
}: {
  item: SiteMedia;
  interactive: boolean;
  onEdit?: (item: SiteMedia) => void;
  onDelete?: (id: string) => void;
  onToggle?: (item: SiteMedia) => void;
}) {
  const options = [
    { value: "edit", label: "Редактировать", icon: <IconPencil className="size-4" /> },
    ...(interactive
      ? [
          {
            value: "toggle",
            label: item.isActive ? "Скрыть на сайте" : "Показать на сайте",
            icon: item.isActive ? (
              <IconEyeOff className="size-4" />
            ) : (
              <IconEye className="size-4" />
            ),
          },
          { value: "delete", label: "Удалить", icon: <IconTrash className="size-4" /> },
        ]
      : []),
  ];
  const choose = (value: string) => {
    if (value === "edit") onEdit?.(item);
    if (value === "toggle") onToggle?.(item);
    if (value === "delete") void onDelete?.(item.id);
  };
  return (
    <CustomSelect
      value=""
      onChange={choose}
      options={options}
      ariaLabel={`Действия для фото «${item.title || item.alt}»`}
      size="compact"
      trigger={<IconDotsVertical className="size-5" />}
    />
  );
}

function MediaLoadingCards({ count }: { count: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Загружаем медиафайлы">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-md border border-line bg-surface"
          aria-hidden="true"
        >
          <div className="relative aspect-video animate-pulse bg-field">
            <div className="absolute right-3 top-3 h-8 w-24 rounded-md bg-surface-raised" />
          </div>
        </div>
      ))}
    </div>
  );
}
