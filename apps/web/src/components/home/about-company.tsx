import Link from "next/link";
import { IconArrowRight, IconCheck } from "@tabler/icons-react";
import { ProductionGallery } from "@/components/home/production-gallery";
import type { GallerySlide } from "@/components/home/production-gallery";

const capabilities = [
  "Поршневые и телескопические гидроцилиндры",
  "Серийные изделия и изготовление по чертежам заказчика",
  "Решения для сельскохозяйственной, карьерной, дорожно-строительной и коммунальной техники",
];

type AboutCompanyProps = {
  showIntro?: boolean;
  gallerySlides?: readonly GallerySlide[];
};

export function AboutCompany({ showIntro = false, gallerySlides }: AboutCompanyProps) {
  const ContentHeading: "h2" | "h3" = showIntro ? "h3" : "h2";

  return (
    <section className="bg-white py-18 lg:py-24">
      <div className="mx-auto max-w-360 px-4 sm:px-6 lg:px-8">
        {showIntro ? (
          <div className="max-w-4xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">О нас</p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
              Производим и поставляем гидроцилиндры с 2012 года
            </h2>
            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg">
              ООО «Гидравлика 25» — производитель гидроцилиндров Магистр® в России. Производство
              находится в Орле, поставки выполняем для клиентов по всей стране.
            </p>
          </div>
        ) : null}

        <div
          className={`${showIntro ? "mt-14 " : ""}grid gap-10 lg:grid-cols-[1fr_.92fr] lg:items-start lg:gap-16`}
        >
          <div>
            <ContentHeading className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Гидроцилиндры для техники и производственных задач
            </ContentHeading>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
              В ассортименте — гидроцилиндры для широкого спектра техники. Основной ходовой
              ассортимент поддерживаем в наличии на складе в Орле.
            </p>
            <ul className="mt-7 grid gap-3">
              {capabilities.map((capability) => (
                <li
                  key={capability}
                  className="flex items-start gap-3 text-sm font-medium leading-6 text-slate-700"
                >
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-white">
                    <IconCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  {capability}
                </li>
              ))}
            </ul>
            <Link
              href="/production"
              className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 bg-brand px-5 text-sm font-bold text-white transition-colors hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
            >
              Производственная площадка
              <IconArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          {/* An empty list means every photo is hidden in Back Office. */}
          {gallerySlides?.length === 0 ? null : <ProductionGallery slides={gallerySlides} />}
        </div>

        <div className="mt-14 grid border-y border-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-slate-200">
          <div className="py-6 sm:px-6 sm:first:pl-0">
            <p className="text-2xl font-black tracking-tight text-brand">Розница и малый опт</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              для частных клиентов, ИП и организаций
            </p>
          </div>
          <div className="py-6 sm:px-6">
            <p className="text-2xl font-black tracking-tight text-brand">Средний и крупный опт</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              условия рассчитываем под объём заказа
            </p>
          </div>
          <div className="py-6 sm:px-6 sm:pr-0">
            <p className="text-2xl font-black tracking-tight text-brand">Склад в Орле</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              ходовые модели доступны для отгрузки
            </p>
          </div>
        </div>

        <div className="mt-14 max-w-3xl border-l-2 border-brand pl-5">
          <ContentHeading className="text-2xl font-black tracking-tight text-slate-950">
            Прозрачные условия и внимательный сервис
          </ContentHeading>
          <p className="mt-3 text-base leading-7 text-slate-600">
            Сообщаем актуальную цену и наличие до оформления заказа, помогаем подобрать решение под
            задачу. Система скидок зависит от объёма покупки; для разовой отгрузки свыше 5 млн ₽
            предусмотрены максимальные скидки.
          </p>
        </div>
      </div>
    </section>
  );
}
