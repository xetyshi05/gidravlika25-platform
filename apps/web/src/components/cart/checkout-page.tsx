"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckoutForm } from "@/components/cart/checkout-form";
import { useCart } from "@/components/cart/cart-provider";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useSuccessReveal } from "@/lib/use-success-reveal";

export function CheckoutPage() {
  const { items, clearCart, isHydrated } = useCart();
  const [submittedRequestNumber, setSubmittedRequestNumber] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const {
    stage: successStage,
    headingRef,
    reveal: revealSuccess,
  } = useSuccessReveal(submittedRequestNumber);

  const copyRequestNumber = async () => {
    if (!submittedRequestNumber) return;
    try {
      await navigator.clipboard.writeText(`Гидравлика 25. Заявка №${submittedRequestNumber}`);
      setIsCopied(true);
    } catch {
      setIsCopied(false);
    }
  };

  if (!isHydrated) {
    return (
      <section
        className="grid min-h-96 place-items-center bg-slate-50 px-4"
        aria-label="Загрузка оформления заявки"
      >
        <LoadingSpinner label="Загружаем заявку" className="min-h-12 min-w-12" />
      </section>
    );
  }

  if (submittedRequestNumber) {
    return (
      <section className="mx-auto grid min-h-120 max-w-240 place-items-center px-4 py-10 sm:px-6 lg:py-16">
        <div className="relative h-132 w-full max-w-xl text-center">
          <div className="absolute inset-x-0 top-16">
            <div
              className={`mx-auto grid size-18 place-items-center rounded-full bg-red-50 ${
                successStage >= 1 ? "checkout-success-check" : "opacity-0"
              }`}
            >
              <svg viewBox="0 0 48 48" className="size-11" aria-hidden="true">
                <path
                  d="m12 25 8 8 17-18"
                  className={successStage >= 1 ? "checkout-success-check-path" : ""}
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="5"
                />
              </svg>
            </div>
          </div>
          <div
            className={`absolute inset-x-0 top-46 ${
              successStage >= 2 ? "checkout-success-content-enter" : "opacity-0"
            }`}
            onFocus={(event) => {
              if (event.target !== headingRef.current) revealSuccess();
            }}
          >
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-3xl font-black tracking-tight text-slate-950 outline-none sm:text-4xl"
            >
              Заявка <span className="text-brand">№ {submittedRequestNumber}</span>
            </h1>
            <button
              type="button"
              onClick={copyRequestNumber}
              className="mt-5 inline-flex min-h-11 items-center justify-center border border-brand px-5 text-sm font-bold text-brand transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {isCopied ? "Номер скопирован" : "Скопировать номер"}
            </button>
            <p role="status" className="mt-6 text-base leading-7 text-slate-600">
              Заявка принята. Менеджер свяжется с вами, чтобы подтвердить детали заказа. Скопируйте
              номер на всякий случай — он поможет нам быстрее найти вашу заявку.
            </p>
            <Link
              href="/catalog"
              className="mt-8 inline-flex min-h-12 items-center justify-center bg-brand px-6 text-sm font-bold text-white transition-colors hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
            >
              Вернуться в каталог
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="mx-auto max-w-240 px-4 py-12 sm:px-6 lg:py-16">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">
          Оформление заявки
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
          В заявке пока нет товаров
        </h1>
        <Link
          href="/catalog"
          className="mt-7 inline-flex min-h-12 items-center justify-center bg-brand px-5 text-sm font-bold text-white transition-colors hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
        >
          Перейти в каталог
        </Link>
      </section>
    );
  }

  return (
    <CheckoutForm
      items={items}
      onSuccess={(requestNumber) => {
        setIsCopied(false);
        setSubmittedRequestNumber(requestNumber);
        clearCart();
      }}
    />
  );
}
