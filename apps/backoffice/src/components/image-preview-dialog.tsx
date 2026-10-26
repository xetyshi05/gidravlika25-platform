"use client";

import { IconX } from "@tabler/icons-react";
import { useRef } from "react";
import { ProductImage } from "@/components/product-image";
import { useModalAccessibility } from "@/lib/use-modal-accessibility";

export function ImagePreviewDialog({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(dialogRef, onClose);

  return (
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[70] grid place-items-center bg-black/80 p-4 bo-modal-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Полноразмерное изображение: ${alt}`}
        tabIndex={-1}
        className="relative flex max-h-full max-w-full items-center justify-center outline-none"
      >
        <ProductImage
          src={src}
          alt={alt}
          width={2400}
          height={1600}
          className="max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] object-contain"
        />
        <button
          type="button"
          onClick={onClose}
          data-modal-initial-focus=""
          aria-label="Закрыть полноразмерный просмотр"
          className="absolute right-2 top-2 grid size-10 place-items-center rounded-full bg-black/65 text-white hover:bg-black/85"
        >
          <IconX className="size-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
