import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IconArrowLeft, IconCheck } from "@tabler/icons-react";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { CatalogProductImage } from "@/components/catalog/catalog-product-image";
import { JsonLd } from "@/components/seo/json-ld";
import { getCatalogProduct, isCatalogNotFound, type CatalogProduct } from "@/lib/catalog-api";
import { absoluteUrl, defaultSocialImage, siteUrl } from "@/lib/site";

export const revalidate = 60;

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

function formatValue(value: number | string | null, unit: string): string {
  return value === null ? "Не указано" : `${value} ${unit}`;
}

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

async function getProductOrNotFound(slug: string): Promise<CatalogProduct> {
  try {
    return await getCatalogProduct(slug);
  } catch (error) {
    if (isCatalogNotFound(error)) {
      notFound();
    }

    throw error;
  }
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  let product: CatalogProduct;

  try {
    product = await getCatalogProduct(slug);
  } catch (error) {
    if (isCatalogNotFound(error)) {
      notFound();
    }

    return {
      title: "Каталог временно недоступен",
      robots: { index: false, follow: false },
    };
  }

  const description = getProductDescription(product);
  const path = `/catalog/${product.slug}`;
  const image = product.imagePath ?? defaultSocialImage.url;

  return {
    title: product.name,
    description,
    alternates: { canonical: path },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: "ru_RU",
      siteName: "Гидравлика 25",
      title: `${product.name} — Гидравлика 25`,
      description,
      url: path,
      images: [{ url: image, alt: product.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.name} — Гидравлика 25`,
      description,
      images: [image],
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getProductOrNotFound(slug);

  const specifications = [
    {
      label: "Диаметр поршня",
      value: formatValue(product.pistonDiameterMm, "мм"),
    },
    { label: "Диаметр штока", value: formatValue(product.rodDiameterMm, "мм") },
    { label: "Рабочий ход", value: formatValue(product.strokeMm, "мм") },
    {
      label: "Размер в сложенном состоянии",
      value: formatValue(product.collapsedLengthMm, "мм"),
    },
    {
      label: "Максимальное давление",
      value: formatValue(product.maxPressureMpa, "МПа"),
    },
    {
      label: "Номинальное давление",
      value: formatValue(product.nominalPressureMpa, "МПа"),
    },
  ];
  const description = getProductDescription(product);
  const shortDescription = product.shortDescription?.trim();
  const fullDescription = product.description?.trim();
  const productUrl = absoluteUrl(`/catalog/${product.slug}`);
  const productImage = absoluteUrl(product.imagePath ?? defaultSocialImage.url);
  const numericPrice = product.price === null ? 0 : Number(product.price);
  const offers =
    product.price !== null && numericPrice > 0
      ? {
          "@type": "Offer",
          url: productUrl,
          priceCurrency: "RUB",
          price: product.price,
          priceValidUntil: `${new Date().getUTCFullYear() + 1}-12-31`,
          availability:
            product.stockQuantity > 0
              ? "https://schema.org/InStock"
              : "https://schema.org/PreOrder",
          itemCondition: "https://schema.org/NewCondition",
          seller: { "@id": `${siteUrl}/#organization` },
        }
      : undefined;

  return (
    <>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Product",
            "@id": `${productUrl}#product`,
            name: product.name,
            description,
            image: [productImage],
            sku: product.sku,
            category: product.category.name,
            brand: { "@type": "Brand", name: "Магистр" },
            offers,
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Главная",
                item: siteUrl,
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "Каталог",
                item: absoluteUrl("/catalog"),
              },
              {
                "@type": "ListItem",
                position: 3,
                name: product.name,
                item: productUrl,
              },
            ],
          },
        ]}
      />
      <section className="mx-auto max-w-360 px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
        <Link
          href="/catalog"
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 transition-colors hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
        >
          <IconArrowLeft className="h-4 w-4" aria-hidden="true" /> Вернуться в каталог
        </Link>
        <div className="mt-7 grid gap-10 lg:grid-cols-[.95fr_1.05fr] lg:items-center lg:gap-14">
          <div className="relative aspect-[4/3] overflow-hidden">
            <CatalogProductImage
              imagePath={product.imagePath}
              alt={product.name}
              sizes="(min-width: 1024px) 45vw, 92vw"
              priority
              className="object-contain"
            />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">
              {product.category.name}
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              {product.name}
            </h1>
            <p className="mt-3 text-sm font-medium text-slate-500">Артикул: {product.sku}</p>
            {shortDescription ? (
              <p className="mt-4 whitespace-pre-line text-base leading-7 text-slate-700">
                {shortDescription}
              </p>
            ) : null}
            <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(13rem,1fr)] sm:gap-4">
                <p className="text-3xl font-black tracking-tight text-slate-950 sm:justify-self-start">
                  {formatPrice(product.price)}
                </p>
                <span
                  className={`inline-flex items-center justify-self-end gap-2 text-sm font-bold sm:justify-self-center ${
                    product.stockStatus === "IN_STOCK"
                      ? "text-emerald-700"
                      : product.stockStatus === "LOW_STOCK"
                        ? "text-amber-700"
                        : "text-slate-500"
                  }`}
                >
                  <IconCheck className="h-5 w-5" aria-hidden="true" />
                  {product.stockStatus === "IN_STOCK"
                    ? "В наличии"
                    : product.stockStatus === "LOW_STOCK"
                      ? "Осталось мало"
                      : "Под заказ"}
                </span>
                <div className="col-span-2 w-full sm:col-span-1 sm:w-52 sm:justify-self-end">
                  <AddToCartButton
                    product={product}
                    fullWidth
                    className="product-purchase-control"
                  />
                </div>
              </div>
            </div>
            <h2
              id="product-specifications-title"
              className="mt-10 text-xl font-black text-slate-950"
            >
              Характеристики
            </h2>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <table
                className="w-full border-collapse text-sm [&_tr:first-child>*]:pt-0 [&_tr:last-child>*]:pb-0"
                aria-labelledby="product-specifications-title"
              >
                <tbody className="divide-y divide-slate-200">
                  {specifications.map((specification) => (
                    <tr key={specification.label}>
                      <th scope="row" className="py-3 pr-4 text-left font-medium text-slate-600">
                        {specification.label}
                      </th>
                      <td className="whitespace-nowrap py-3 pl-4 text-right font-bold text-slate-950">
                        {specification.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {fullDescription ? (
          <section aria-labelledby="product-description-title" className="mt-12 max-w-4xl">
            <h2 id="product-description-title" className="text-xl font-black text-slate-950">
              Описание
            </h2>
            <p className="mt-4 whitespace-pre-line text-base leading-7 text-slate-700">
              {fullDescription}
            </p>
          </section>
        ) : null}
      </section>
    </>
  );
}

function getProductDescription(product: CatalogProduct) {
  const suppliedDescription = product.shortDescription ?? product.description;
  if (suppliedDescription?.trim()) return suppliedDescription.trim();

  const details = [
    product.pistonDiameterMm ? `поршень ${product.pistonDiameterMm} мм` : null,
    product.rodDiameterMm ? `шток ${product.rodDiameterMm} мм` : null,
    product.strokeMm ? `ход ${product.strokeMm} мм` : null,
  ].filter(Boolean);

  return `${product.name}${details.length > 0 ? `: ${details.join(", ")}` : ""}. Характеристики и заказ гидроцилиндра с доставкой по России.`;
}
