import Link from "next/link";
import { IconCheck } from "@tabler/icons-react";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { CatalogProductImage } from "@/components/catalog/catalog-product-image";
import type { CatalogProduct } from "@/lib/catalog-api";

type ProductCardProps = {
  product: CatalogProduct;
};

function formatPrice(price: string | null): string {
  if (price === null || Number(price) <= 0) {
    return "По запросу";
  }

  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(Number(price));
}

function formatDimension(value: number | null): string {
  return value === null ? "—" : `${value} мм`;
}

export function ProductCard({ product }: ProductCardProps) {
  const stockPresentation = {
    IN_STOCK: { label: "В наличии", className: "text-emerald-700" },
    LOW_STOCK: { label: "Осталось мало", className: "text-amber-700" },
    MADE_TO_ORDER: { label: "Под заказ", className: "text-slate-500" },
  }[product.stockStatus];

  return (
    <article className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-colors duration-200 ease-out hover:border-brand">
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-50">
        <CatalogProductImage
          imagePath={product.imagePath}
          alt={product.name}
          sizes="(min-width: 1280px) 26vw, (min-width: 640px) 42vw, 92vw"
          className="object-contain"
        />
      </div>
      <div className="flex flex-1 flex-col p-4 pt-5 sm:p-5 sm:pt-6">
        <p className="text-xs font-semibold tracking-wide text-slate-500">Артикул: {product.sku}</p>
        <h2 className="mt-2 h-12 overflow-hidden text-lg font-black leading-6 tracking-tight text-slate-950">
          {product.name}
        </h2>
        <dl className="mt-5 grid grid-cols-3 border-y border-slate-100 py-4 text-xs">
          <div className="text-left">
            <dt className="text-slate-500">Ход</dt>
            <dd className="mt-1 font-bold text-slate-800">{formatDimension(product.strokeMm)}</dd>
          </div>
          <div className="text-center">
            <dt className="text-slate-500">Шток</dt>
            <dd className="mt-1 font-bold text-slate-800">
              {formatDimension(product.rodDiameterMm)}
            </dd>
          </div>
          <div className="text-right">
            <dt className="text-slate-500">Поршень</dt>
            <dd className="mt-1 font-bold text-slate-800">
              {formatDimension(product.pistonDiameterMm)}
            </dd>
          </div>
        </dl>
        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <div>
            <p className="text-xl font-black tracking-tight text-slate-950">
              {formatPrice(product.price)}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 text-sm font-bold ${stockPresentation.className}`}
          >
            <IconCheck className="h-4.5 w-4.5" aria-hidden="true" />
            {stockPresentation.label}
          </span>
        </div>
        <AddToCartButton product={product} fullWidth compact className="relative z-20 mt-5" />
      </div>
      <Link
        href={`/catalog/${product.slug}`}
        aria-label={`Открыть товар «${product.name}»`}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-brand"
      />
    </article>
  );
}
