import Link from "next/link";
import { IconArrowUpRight } from "@tabler/icons-react";
import { ProductCard } from "@/components/catalog/product-card";
import { SectionHeading } from "@/components/home/section-heading";
import type { CatalogProduct } from "@/lib/catalog-api";

type PopularProductsProps = {
  products: CatalogProduct[];
  heading?: { eyebrow: string; title: string; description: string };
  showCatalogLink?: boolean;
};

export function PopularProducts({
  products,
  heading = {
    eyebrow: "В наличии",
    title: "Популярные гидроцилиндры",
    description: "Актуальные цены и остатки из каталога собственного производства.",
  },
  showCatalogLink = true,
}: PopularProductsProps) {
  return (
    <section id="popular" className="bg-slate-100 py-18 lg:py-24">
      <div className="mx-auto max-w-360 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <SectionHeading {...heading} />
          {showCatalogLink ? (
            <Link
              href="/catalog"
              className="inline-flex items-center gap-2 self-start text-sm font-bold text-slate-950 underline decoration-brand decoration-2 underline-offset-5 transition-colors hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand md:self-auto"
            >
              Смотреть каталог <IconArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}
