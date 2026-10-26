import type { MetadataRoute } from "next";
import { getCatalogSitemapProducts } from "@/lib/catalog-api";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

const staticPages: Array<{
  path: string;
  changeFrequency: "weekly" | "monthly";
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/catalog", changeFrequency: "weekly", priority: 0.9 },
  { path: "/custom-production", changeFrequency: "monthly", priority: 0.8 },
  { path: "/production", changeFrequency: "monthly", priority: 0.7 },
  { path: "/about", changeFrequency: "monthly", priority: 0.6 },
  { path: "/payment-delivery", changeFrequency: "monthly", priority: 0.6 },
  { path: "/contacts", changeFrequency: "monthly", priority: 0.6 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getCatalogSitemapProducts();

  return [
    ...staticPages.map((page) => ({
      url: absoluteUrl(page.path),
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    })),
    ...products.map((product) => ({
      url: absoluteUrl(`/catalog/${product.slug}`),
      lastModified: new Date(product.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
