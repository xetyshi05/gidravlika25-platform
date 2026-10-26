"use client";

import { IconPhotoOff } from "@tabler/icons-react";
import Image from "next/image";
import { useState } from "react";

type ProductImageProps = {
  src: string | null | undefined;
  alt: string;
  width: number;
  height: number;
  className?: string;
  compact?: boolean;
};

export function ProductImage({
  src,
  alt,
  width,
  height,
  className,
  compact = false,
}: ProductImageProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const source = src && src !== failedSource ? src : null;

  if (!source) {
    return (
      <div
        role="img"
        aria-label={`Изображение товара «${alt}» отсутствует`}
        className="grid size-full place-items-center text-center"
      >
        <div>
          <IconPhotoOff
            className={`mx-auto text-slate-500 ${compact ? "size-4" : "size-6"}`}
            aria-hidden="true"
          />
          {!compact ? (
            <span className="mt-3 block text-xs font-medium text-copy-muted">Фото пока нет</span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <Image
      unoptimized
      src={source}
      alt={alt}
      width={width}
      height={height}
      className={className}
      onError={() => setFailedSource(source)}
    />
  );
}
