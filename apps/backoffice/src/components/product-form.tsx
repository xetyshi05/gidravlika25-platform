"use client";

import { IconDeviceFloppy, IconX } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePreviewDialog } from "@/components/image-preview-dialog";
import { ProductImageEditorDialog } from "@/components/product-image-editor-dialog";
import { CustomSelect, Switch } from "@/components/ui";
import { ProductImage } from "@/components/product-image";
import { getCategories, saveProduct, uploadProductImage } from "@/lib/backoffice-api";
import { useModalAccessibility } from "@/lib/use-modal-accessibility";
import type { Category, Product } from "@/data/catalog";

type Values = {
  name: string;
  sku: string;
  categoryId: string;
  price: string;
  stockQuantity: string;
  isActive: boolean;
  pistonDiameterMm: string;
  rodDiameterMm: string;
  strokeMm: string;
  collapsedLengthMm: string;
  maxPressureMpa: string;
  nominalPressureMpa: string;
};
const toValues = (product?: Product): Values => ({
  name: product?.name ?? "",
  sku: product?.sku ?? "",
  categoryId: product?.categoryId ?? "",
  price: product?.price ?? "",
  stockQuantity: String(product?.stockQuantity ?? 0),
  isActive: product?.isActive ?? true,
  pistonDiameterMm: String(product?.pistonDiameterMm ?? ""),
  rodDiameterMm: String(product?.rodDiameterMm ?? ""),
  strokeMm: String(product?.strokeMm ?? ""),
  collapsedLengthMm: String(product?.collapsedLengthMm ?? ""),
  maxPressureMpa: String(product?.maxPressureMpa ?? ""),
  nominalPressureMpa: String(product?.nominalPressureMpa ?? ""),
});
const requiredFields = new Set<keyof Values>(["name", "sku", "price", "stockQuantity"]);
/** Matches the API: price and pressures are stored with two decimal places. */
const decimalFields = new Set<keyof Values>(["price", "maxPressureMpa", "nominalPressureMpa"]);

export function ProductModal({
  product,
  onClose,
  onSaved,
}: {
  product?: Product;
  onClose: () => void;
  onSaved: (product: Product) => void;
}) {
  const initial = useMemo(() => toValues(product), [product]);
  const [values, setValues] = useState(initial);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pendingImage, setPendingImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLFormElement>(null);
  const close = () => {
    if (!saving) onClose();
  };
  useModalAccessibility(dialogRef, () => {
    if (imagePreview) setImagePreview(null);
    else if (imageEditorOpen) setImageEditorOpen(false);
    else close();
  });
  useEffect(() => {
    void getCategories().then((items) => {
      setCategories(items);
      setValues((current) =>
        current.categoryId || !items[0] ? current : { ...current, categoryId: items[0].id },
      );
    });
  }, []);
  useEffect(
    () => () => {
      if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    },
    [pendingImage],
  );
  const set = (key: keyof Values, value: string | boolean) =>
    setValues((current) => ({ ...current, [key]: value }));
  const setPreparedImage = ({ file, processed }: { file: File; processed: Blob }) => {
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage({ file, previewUrl: URL.createObjectURL(processed) });
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    let productSaved = false;
    try {
      // An emptied optional number is sent as null so the server clears the stored value.
      const optionalNumber = (value: string) => (value === "" ? null : Number(value));
      // The API rejects the edit with 409 if the product changed after the form was opened.
      let saved = await saveProduct(
        {
          name: values.name,
          sku: values.sku,
          categoryId: values.categoryId,
          price: Number(values.price),
          stockQuantity: Number(values.stockQuantity),
          isActive: values.isActive,
          pistonDiameterMm: optionalNumber(values.pistonDiameterMm),
          rodDiameterMm: optionalNumber(values.rodDiameterMm),
          strokeMm: optionalNumber(values.strokeMm),
          collapsedLengthMm: optionalNumber(values.collapsedLengthMm),
          maxPressureMpa: optionalNumber(values.maxPressureMpa),
          nominalPressureMpa: optionalNumber(values.nominalPressureMpa),
        },
        product,
      );
      productSaved = true;
      if (pendingImage) {
        const uploaded = await uploadProductImage(saved.id, pendingImage.file);
        saved = { ...saved, imagePath: uploaded.imagePath };
      }
      onSaved(saved);
      window.dispatchEvent(new CustomEvent("backoffice:notice", { detail: "Товар сохранён" }));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Не удалось сохранить товар.";
      window.dispatchEvent(
        new CustomEvent("backoffice:notice", {
          detail: productSaved
            ? `Данные товара сохранены, но изображение не загружено. ${message}`
            : message,
        }),
      );
    } finally {
      setSaving(false);
    }
  };
  const field = (key: keyof Values, label: string, unit?: string) => (
    <label>
      <span className="mb-2 block text-sm text-copy-muted">{label}</span>
      <div className="relative">
        <input
          data-modal-initial-focus={key === "name" ? "" : undefined}
          required={requiredFields.has(key)}
          value={String(values[key])}
          onChange={(event) => set(key, event.target.value)}
          type={unit ? "number" : "text"}
          min={unit ? 0 : undefined}
          step={unit ? (decimalFields.has(key) ? "0.01" : 1) : undefined}
          className="h-10 w-full rounded-md border border-line bg-field px-3 pr-12 text-sm focus:border-brand"
        />
        {unit && <span className="absolute right-3 top-2.5 text-xs text-copy-faint">{unit}</span>}
      </div>
    </label>
  );
  return (
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 bo-modal-backdrop"
    >
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-dialog-title"
        aria-busy={saving}
        tabIndex={-1}
        onSubmit={(event) => void save(event)}
        className="max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto rounded-md border border-line bg-surface shadow-2xl outline-none bo-modal-card"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-4">
          <h2 id="product-dialog-title" className="text-xl font-medium">
            {product ? "Редактирование товара" : "Новый товар"}
          </h2>
          <button
            type="button"
            disabled={saving}
            onClick={close}
            aria-label="Закрыть"
            className="text-copy-muted hover:text-brand disabled:opacity-40"
          >
            <IconX className="size-6" />
          </button>
        </div>
        <div className="grid gap-6 p-5 lg:grid-cols-[1fr_260px]">
          <div className="space-y-6">
            <section>
              <h3 className="mb-4 text-sm font-medium text-copy">Основное</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {field("name", "Название")}
                {field("sku", "Артикул")}
                <label>
                  <span className="mb-2 block text-sm text-copy-muted">Категория</span>
                  <CustomSelect
                    value={values.categoryId}
                    onChange={(value) => set("categoryId", value)}
                    options={categories.map((category) => ({
                      value: category.id,
                      label: category.name,
                    }))}
                    ariaLabel="Категория"
                  />
                </label>
                {field("price", "Цена", "₽")}
              </div>
            </section>
            <section className="border-t border-line pt-5">
              <h3 className="mb-4 text-sm font-medium text-copy">Параметры гидроцилиндра</h3>
              <div className="grid gap-4 md:grid-cols-3">
                {field("pistonDiameterMm", "Диаметр поршня", "мм")}
                {field("rodDiameterMm", "Диаметр штока", "мм")}
                {field("strokeMm", "Ход", "мм")}
                {field("collapsedLengthMm", "Монтажная длина", "мм")}
                {field("maxPressureMpa", "Макс. давление", "МПа")}
                {field("nominalPressureMpa", "Номинальное давление", "МПа")}
              </div>
            </section>
            <section className="border-t border-line pt-5">
              <div className="grid gap-4 md:grid-cols-2">
                {field("stockQuantity", "Остаток", "шт.")}
                <div>
                  <span className="mb-2 block text-sm text-copy-muted">Активен</span>
                  <div className="flex h-10 items-center">
                    <Switch
                      ariaLabel="Товар активен"
                      checked={values.isActive}
                      onCheckedChange={(checked) => set("isActive", checked)}
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
          <section className="h-fit border-l border-line pl-6">
            <h3 className="mb-4 text-sm font-medium text-copy">Фото товара</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <ImageSlot
                label="Текущее"
                src={product?.imagePath}
                alt={product?.name ?? "Текущее фото товара"}
                onPreview={setImagePreview}
              />
              <ImageSlot
                label="Новое"
                src={pendingImage?.previewUrl}
                alt={`Новое фото: ${values.name || "товар"}`}
                onPreview={setImagePreview}
              />
            </div>
            {pendingImage ? (
              <p className="mt-3 text-xs leading-5 text-copy-muted">
                Новое фото подготовлено и будет опубликовано только после сохранения товара.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setImageEditorOpen(true)}
              className="mt-4 inline-flex h-10 items-center rounded-md border border-line px-4 text-sm hover:border-brand hover:text-brand"
            >
              {pendingImage ? "Изменить новое фото" : "Выбрать новое фото"}
            </button>
          </section>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-surface px-5 py-4">
          <button
            type="button"
            disabled={saving}
            onClick={close}
            className="h-10 px-4 text-sm text-copy-muted disabled:opacity-40"
          >
            Отмена
          </button>
          <button
            disabled={
              saving ||
              [...requiredFields].some((key) => !String(values[key]).trim()) ||
              !values.categoryId
            }
            className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconDeviceFloppy className="size-4" />
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </form>
      {imagePreview ? (
        <ImagePreviewDialog
          src={imagePreview}
          alt={values.name || "Фото товара"}
          onClose={() => setImagePreview(null)}
        />
      ) : null}
      {imageEditorOpen ? (
        <ProductImageEditorDialog
          onClose={() => setImageEditorOpen(false)}
          onConfirm={setPreparedImage}
        />
      ) : null}
    </div>
  );
}

function ImageSlot({
  label,
  src,
  alt,
  onPreview,
}: {
  label: string;
  src: string | null | undefined;
  alt: string;
  onPreview: (src: string) => void;
}) {
  return (
    <section>
      <p className="mb-2 text-xs font-medium text-copy-muted">{label}</p>
      <button
        type="button"
        disabled={!src}
        onClick={() => src && onPreview(src)}
        aria-label={`Открыть ${label.toLowerCase()} фото в полном размере`}
        className="grid aspect-square w-full place-items-center rounded-md border border-slate-300 bg-slate-100 p-4 disabled:cursor-default"
      >
        <ProductImage
          src={src}
          alt={alt}
          width={228}
          height={228}
          className="size-full object-contain"
        />
      </button>
    </section>
  );
}
