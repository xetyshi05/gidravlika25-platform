import Image from "next/image";
import Link from "next/link";
import {
  OZON_URL,
  OzonLogo,
  VACANCIES_URL,
  VK_LOGO_PATH,
  VK_URL,
} from "@/components/brand/partner-marks";
import { BrandLogo } from "@/components/layout/brand-logo";
import { CookieSettingsButton } from "@/components/layout/cookie-banner";

const footerLinks = [
  { label: "Главная", href: "/" },
  { label: "Каталог", href: "/catalog" },
  { label: "Изготовление под заказ", href: "/custom-production" },
  { label: "Оплата и доставка", href: "/payment-delivery" },
  { label: "Контакты", href: "/contacts" },
];

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white text-slate-600">
      <div className="mx-auto grid max-w-360 gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.2fr_1fr_1fr] lg:px-8 lg:py-16">
        <div>
          <Link
            href="/"
            aria-label="Гидравлика 25 — главная"
            className="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
          >
            <BrandLogo />
          </Link>
          <p className="mt-5 max-w-xs text-sm leading-6 text-slate-600">
            Гидроцилиндры для серийных задач и производства по индивидуальным параметрам.
          </p>
          <nav aria-label="Мы в социальных сетях и на маркетплейсах" className="mt-6">
            <div className="flex flex-wrap items-center gap-5">
              <a
                href={VK_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Гидравлика 25 во ВКонтакте — открыть в новой вкладке"
                className="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
              >
                <Image
                  src={VK_LOGO_PATH}
                  alt="ВКонтакте"
                  width={575}
                  height={100}
                  unoptimized
                  className="h-7 w-auto"
                />
              </a>
              <a
                href={OZON_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Магазин Гидравлика 25 на Ozon — открыть в новой вкладке"
                className="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
              >
                <OzonLogo className="h-10 w-auto" />
              </a>
            </div>
          </nav>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Разделы</p>
          <ul className="mt-4 space-y-3">
            {footerLinks.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="text-sm transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <a
                href={VACANCIES_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Вакансии Гидравлика 25 на hh.ru — открыть в новой вкладке"
                className="text-sm transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
              >
                Вакансии
              </a>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Документы</p>
          <ul className="mt-4 space-y-3 text-sm">
            <li>
              <Link
                href="/privacy"
                className="transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
              >
                Политика обработки персональных данных
              </Link>
            </li>
            <li>
              <Link
                href="/personal-data-consent"
                className="transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
              >
                Согласие на обработку персональных данных
              </Link>
            </li>
            <li>
              <CookieSettingsButton />
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-200">
        <div className="mx-auto flex max-w-360 flex-col gap-2 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>© 2026 ООО &laquo;Гидравлика 25&raquo;. Все права защищены.</span>
          <span>ИНН 5700012184 · ОГРН 1255700000115</span>
        </div>
      </div>
    </footer>
  );
}
