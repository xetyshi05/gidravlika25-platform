import type { SiteMedia } from "./catalog-api.ts";

export type SiteMediaSlide = {
  src: string;
  alt: string;
  title: string;
};

/** Result of reading `/site-media`: an empty list is a valid answer, an error is not. */
export type SiteMediaResult = { ok: true; media: SiteMedia[] } | { ok: false };

// Bundled with the site, so they keep working when the API or S3 is unavailable.
export const fallbackHeroImage = "/images/production/main-1.webp";
export const fallbackGallerySlides: readonly SiteMediaSlide[] = [
  {
    src: "/images/production/about-1.webp",
    alt: "Здание производства гидроцилиндров",
    title: "Производственная площадка",
  },
  {
    src: "/images/production/about-2.webp",
    alt: "Сборка деталей гидроцилиндров",
    title: "Сборка изделий",
  },
  {
    src: "/images/production/about-3.webp",
    alt: "Оборудование и компоненты гидроцилиндров",
    title: "Подготовка и окраска",
  },
  {
    src: "/images/production/about-4.webp",
    alt: "Склад материалов для производства гидроцилиндров",
    title: "Материалы и комплектующие",
  },
];

export async function loadSiteMedia(load: () => Promise<SiteMedia[]>): Promise<SiteMediaResult> {
  try {
    return { ok: true, media: await load() };
  } catch {
    return { ok: false };
  }
}

function slides(media: SiteMedia[], kind: SiteMedia["kind"]): SiteMediaSlide[] {
  return media.flatMap((item) =>
    item.kind === kind && item.imagePath
      ? [{ src: item.imagePath, alt: item.alt, title: item.title ?? item.alt }]
      : [],
  );
}

export function homeMedia(result: SiteMediaResult) {
  if (!result.ok)
    return { heroImage: fallbackHeroImage, gallerySlides: [...fallbackGallerySlides] };
  const hero = result.media.find((item) => item.kind === "HERO" && item.imagePath);
  return {
    heroImage: hero?.imagePath ?? fallbackHeroImage,
    gallerySlides: slides(result.media, "MAIN_GALLERY"),
  };
}

export function productionPhotos(result: SiteMediaResult): SiteMediaSlide[] {
  return result.ok ? slides(result.media, "GALLERY") : [...fallbackGallerySlides];
}
