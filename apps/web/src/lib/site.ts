import type { Metadata } from "next";

const defaultSiteUrl = "https://gidravlika25.ru";

export const siteUrl = new URL("/", process.env.NEXT_PUBLIC_SITE_URL ?? defaultSiteUrl).origin;

export const defaultSocialImage = {
  url: "/images/production/main-1.webp",
  width: 1448,
  height: 1086,
  alt: "Производство гидроцилиндров Гидравлика 25",
};

type PageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  index?: boolean;
};

export function createPageMetadata({
  title,
  description,
  path,
  index = true,
}: PageMetadataOptions): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: { index, follow: index },
    openGraph: {
      type: "website",
      locale: "ru_RU",
      siteName: "Гидравлика 25",
      title: `${title} — Гидравлика 25`,
      description,
      url: path,
      images: [defaultSocialImage],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — Гидравлика 25`,
      description,
      images: [defaultSocialImage.url],
    },
  };
}

export function absoluteUrl(path: string) {
  return new URL(path, `${siteUrl}/`).toString();
}
