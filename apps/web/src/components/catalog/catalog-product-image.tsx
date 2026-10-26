"use client";

import { Photo } from "@/components/ui/photo";
import { IconPhotoOff } from "@tabler/icons-react";
import { useState } from "react";

type CatalogProductImageProps = {
  imagePath: string | null;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
};

export function CatalogProductImage({
  imagePath,
  alt,
  sizes,
  className,
  priority = false,
}: CatalogProductImageProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const source = imagePath && imagePath !== failedSource ? imagePath : null;

  if (!source) {
    return (
      <div
        role="img"
        aria-label={`Изображение товара «${alt}» отсутствует`}
        className="absolute inset-0 grid place-items-center p-4 text-center"
      >
        <div>
          <IconPhotoOff className="mx-auto size-6 text-slate-400" aria-hidden="true" />
          <span className="mt-3 block text-xs font-bold text-slate-500">Фото пока нет</span>
        </div>
      </div>
    );
  }

  return (
    <Photo
      src={source}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={className}
      onError={() => setFailedSource(source)}
    />
  );
}
