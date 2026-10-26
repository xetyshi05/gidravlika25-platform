import { Photo } from "@/components/ui/photo";
import Link from "next/link";
import { IconArrowUpRight, IconCheck } from "@tabler/icons-react";
import { fallbackHeroImage } from "@/lib/site-media";

const benefits = ["Готовые модели со склада", "Изготовление по параметрам", "Доставка по России"];

export function Hero({ imagePath }: { imagePath?: string | null }) {
  return (
    <section id="top" className="relative isolate overflow-hidden bg-slate-100">
      <Photo
        src={imagePath ?? fallbackHeroImage}
        alt=""
        fill
        priority
        sizes="100vw"
        className="-z-20 object-cover object-center"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-linear-to-r from-white via-white/94 to-white/45 sm:via-white/90 lg:via-white/82 lg:to-white/20"
      />
      <div className="mx-auto max-w-360 px-4 py-14 sm:px-6 lg:px-8 lg:py-22">
        <div className="relative z-10">
          <h1 className="max-w-3xl text-4xl font-black tracking-tight text-slate-950 sm:text-5xl lg:text-6xl lg:leading-[1.04]">
            Гидроцилиндры собственного производства
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
            Для сельскохозяйственной, строительной и промышленной техники. Подберём готовую модель
            или изготовим решение под задачу.
          </p>
          <ul className="mt-7 grid gap-3">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-center gap-2 text-sm text-slate-700">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-white">
                  <IconCheck className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                {benefit}
              </li>
            ))}
          </ul>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/catalog"
              className="inline-flex min-h-12 items-center justify-center gap-2 bg-brand px-5 text-sm font-bold text-white transition-colors hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
            >
              Перейти в каталог <IconArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/custom-production"
              className="inline-flex min-h-12 items-center justify-center border border-brand bg-white px-5 text-sm font-bold text-brand transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
            >
              Изготовить под заказ
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
