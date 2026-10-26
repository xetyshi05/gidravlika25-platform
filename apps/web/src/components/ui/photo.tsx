"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";
import { imageSource } from "@/lib/image-source";

type PhotoProps = Omit<ImageProps, "src" | "unoptimized"> & { src: string };

/**
 * `next/image` for product and site photos (WEB-01, WEB-07): served through the
 * optimizer in the size the screen needs. If the optimizer cannot deliver it
 * (DNS, CDN or a missing image library), the original file is loaded once
 * directly, as before; only a second failure reaches `onError`.
 */
export function Photo({ src, alt, onError, ...props }: PhotoProps) {
  const [directSource, setDirectSource] = useState<string | null>(null);
  const optimized = imageSource(src);
  const direct = directSource === src || optimized.unoptimized;
  return (
    <Image
      {...props}
      alt={alt}
      src={direct ? src : optimized.src}
      unoptimized={direct}
      onError={(event) => {
        if (!direct) setDirectSource(src);
        else onError?.(event);
      }}
    />
  );
}
