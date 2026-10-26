"use client";

import Link from "next/link";
import { IconTrash } from "@tabler/icons-react";
import { CatalogProductImage } from "@/components/catalog/catalog-product-image";
import { useCart } from "@/components/cart/cart-provider";
import { QuantityControl } from "@/components/cart/quantity-control";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

function formatPrice(price: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatProductCount(count: number) {
  const remainder100 = count % 100;
  const remainder10 = count % 10;
  const label =
    remainder100 >= 11 && remainder100 <= 14
      ? "товаров"
      : remainder10 === 1
        ? "товар"
        : remainder10 >= 2 && remainder10 <= 4
          ? "товара"
          : "товаров";

  return `${count} ${label}`;
}

export function CartPage() {
  const { items, total, updateQuantity, removeProduct, clearCart, isHydrated } = useCart();
  const allPricesVisible = items.every((item) => item.price !== null);

  if (!isHydrated) {
    return (
      <section
        className="grid min-h-96 place-items-center bg-slate-50 px-4"
        aria-label="Загрузка корзины"
      >
        <LoadingSpinner label="Загружаем корзину" className="min-h-12 min-w-12" />
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="mx-auto max-w-360 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Корзина</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
          В корзине пока нет товаров
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
          Добавьте гидроцилиндры из каталога, чтобы оформить заказ и согласовать детали с
          менеджером.
        </p>
        <Link
          href="/catalog"
          className="mt-7 inline-flex min-h-12 items-center justify-center bg-brand px-5 text-sm font-bold text-white transition-colors duration-200 ease-out hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
        >
          Перейти в каталог
        </Link>
      </section>
    );
  }

  return (
    <section className="bg-white py-12 lg:py-16">
      <div className="mx-auto max-w-360 px-4 sm:px-6 lg:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">КОРЗИНА</p>
        <div className="mt-3 grid gap-10 xl:grid-cols-[minmax(0,1fr)_24rem] xl:gap-14">
          <div>
            <div className="flex items-end justify-between gap-5">
              <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                Выбранные товары
              </h1>
              <button
                type="button"
                onClick={clearCart}
                className="mb-1 text-sm font-bold text-slate-500 transition-colors duration-200 ease-out hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
              >
                Очистить
              </button>
            </div>
            <div className="mt-8 divide-y divide-slate-200">
              {items.map((item) => (
                <article key={item.slug} className="cart-item grid gap-5 py-6 first:pt-0">
                  <Link
                    href={`/catalog/${item.slug}`}
                    aria-label={`Открыть ${item.name}`}
                    className="cart-item-image relative h-28 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <CatalogProductImage
                      imagePath={item.imagePath}
                      alt={item.name}
                      sizes="9rem"
                      className="object-contain"
                    />
                  </Link>
                  <div className="cart-item-details min-w-0">
                    <p className="text-xs font-semibold tracking-wide text-slate-500">
                      Артикул: {item.sku || "—"}
                    </p>
                    <h2 className="mt-2 text-lg font-black leading-6 tracking-tight text-slate-950">
                      <Link
                        href={`/catalog/${item.slug}`}
                        className="transition-colors duration-200 ease-out hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
                      >
                        {item.name}
                      </Link>
                    </h2>
                    <p className="mt-3 text-sm text-slate-500">
                      Поршень {item.pistonDiameterMm ?? "—"} мм · Шток {item.rodDiameterMm ?? "—"}{" "}
                      мм · Ход {item.strokeMm ?? "—"} мм
                    </p>
                  </div>
                  <p className="cart-item-price text-xl font-black tracking-tight text-slate-950">
                    {item.price !== null && Number(item.price) > 0
                      ? formatPrice(Number(item.price) * item.quantity)
                      : "По запросу"}
                  </p>
                  <div className="cart-item-controls flex items-center gap-3">
                    <QuantityControl
                      productName={item.name}
                      quantity={item.quantity}
                      onDecrease={() => updateQuantity(item.slug, item.quantity - 1)}
                      onIncrease={() => updateQuantity(item.slug, item.quantity + 1)}
                      onQuantityChange={(quantity) => updateQuantity(item.slug, quantity)}
                      className="cart-quantity-control"
                    />
                    <button
                      type="button"
                      onClick={() => removeProduct(item.slug)}
                      aria-label={`Удалить товар ${item.name} из корзины`}
                      className="cart-item-remove grid size-10 shrink-0 place-items-center text-slate-400 transition-colors duration-200 ease-out hover:bg-slate-100 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      <IconTrash className="size-5" aria-hidden="true" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/5 xl:sticky xl:top-6">
            <h2 className="text-xl font-black text-slate-950">Ваш заказ</h2>
            <div className="mt-8 flex items-center justify-between gap-4 text-base text-slate-700">
              <span>{formatProductCount(items.length)}</span>
              <span className="font-bold text-slate-950">
                {allPricesVisible ? formatPrice(total) : "По запросу"}
              </span>
            </div>
            <div className="mt-8 flex items-end justify-between gap-4 border-t border-slate-200 pt-6">
              <span className="text-lg font-bold text-slate-950">Итого</span>
              <strong className="text-3xl font-black tracking-tight text-slate-950">
                {allPricesVisible ? formatPrice(total) : "По запросу"}
              </strong>
            </div>
            <div className="mt-6">
              <a
                href="/checkout"
                className="inline-flex min-h-12 w-full items-center justify-center bg-brand px-5 text-sm font-bold text-white transition-colors duration-200 ease-out hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
              >
                Оформить заявку
              </a>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                После оформления менеджер уточнит наличие, стоимость и способ получения.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
