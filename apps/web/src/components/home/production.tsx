import Image from "next/image";
import { SectionHeading } from "@/components/home/section-heading";

export function Production() {
  return (
    <section id="production" className="bg-white py-18 lg:py-24">
      <div className="mx-auto grid max-w-360 gap-10 px-4 sm:px-6 lg:grid-cols-[.85fr_1.15fr] lg:items-center lg:px-8">
        <div>
          <SectionHeading
            eyebrow="Производство"
            title="От серийных моделей до индивидуальных изделий"
            description="Собственное производство и контроль ключевых параметров на каждом этапе."
          />
          <div className="mt-7 grid grid-cols-3 gap-4 border-t border-slate-200 pt-5 text-sm">
            <div>
              <p className="font-black text-brand">Серия</p>
              <p className="mt-1 text-slate-500">Ходовые позиции</p>
            </div>
            <div>
              <p className="font-black text-brand">Контроль</p>
              <p className="mt-1 text-slate-500">Рабочих параметров</p>
            </div>
            <div>
              <p className="font-black text-brand">Под заказ</p>
              <p className="mt-1 text-slate-500">По исходным данным</p>
            </div>
          </div>
        </div>
        <div className="relative min-h-72 overflow-hidden bg-white sm:min-h-96">
          <Image
            src="/images/production/2026-03-06%2010.11.57.webp"
            alt="Склад материалов для производства гидроцилиндров"
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover"
          />
          <span className="absolute bottom-5 left-5 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700">
            Материалы и комплектующие для производства
          </span>
        </div>
      </div>
    </section>
  );
}
