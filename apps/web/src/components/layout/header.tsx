import Link from "next/link";
import { CartLink } from "@/components/cart/cart-link";
import { BrandLogo } from "@/components/layout/brand-logo";
import { HeaderNavigation } from "@/components/layout/header-navigation";
import { MobileNavigation } from "@/components/layout/mobile-navigation";

const navigation = [
  { label: "Главная", href: "/" },
  { label: "Каталог", href: "/catalog" },
  { label: "Изготовление под заказ", href: "/custom-production" },
  { label: "Оплата и доставка", href: "/payment-delivery" },
  { label: "Контакты", href: "/contacts" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-18 max-w-360 items-center justify-between gap-4 px-4 sm:px-6 lg:h-22 lg:px-8">
        <Link
          href="/"
          aria-label="Гидравлика 25 — главная"
          className="group flex shrink-0 items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4"
        >
          <BrandLogo />
        </Link>

        <HeaderNavigation items={navigation} />

        <div className="flex items-center gap-1 sm:gap-3">
          <div className="hidden flex-col items-end gap-1 sm:flex">
            <a
              href="tel:+79299185147"
              className="group flex items-baseline gap-2 outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span className="text-xs font-medium text-slate-500">Оптовый отдел:</span>
              <span className="text-sm font-bold text-slate-900 transition-colors duration-200 ease-out group-hover:text-brand">
                +7 (929) 918-51-47
              </span>
            </a>
            <a
              href="tel:+79253858421"
              className="group flex items-baseline gap-2 outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span className="text-xs font-medium text-slate-500">Розничный отдел:</span>
              <span className="text-sm font-bold text-slate-900 transition-colors duration-200 ease-out group-hover:text-brand">
                +7 (925) 385-84-21
              </span>
            </a>
          </div>
          <CartLink />
          <MobileNavigation items={navigation} />
        </div>
      </div>
    </header>
  );
}
