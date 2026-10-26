import { IconArrowUpRight } from "@tabler/icons-react";
import { SectionHeading } from "@/components/home/section-heading";
import type { CatalogCategory } from "@/lib/catalog-api";

type CategoriesProps = {
  categories: CatalogCategory[];
};

export function Categories({ categories }: CategoriesProps) {
  return (
    <section id="catalog" className="mx-auto max-w-360 px-4 py-18 sm:px-6 lg:px-8 lg:py-24">
      <SectionHeading
        eyebrow="Каталог"
        title="Каталог гидроцилиндров"
        description="Подберите решение по диаметру поршня или перейдите к полному ассортименту."
      />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category, index) => (
          <Link
            key={category.id}
            href="/catalog"
            className="group relative min-h-37 overflow-hidden border border-slate-200 bg-slate-50 p-5 transition-colors hover:border-slate-500 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand"
          >
            <span className="absolute right-4 top-3 text-5xl font-black tracking-tighter text-slate-200 transition-colors group-hover:text-red-100">
              0{index + 1}
            </span>
            <span className="relative block text-xl font-black tracking-tight text-slate-950">
              {category.name}
            </span>
            <span className="relative mt-2 block text-sm text-slate-500">
              {category.productCount} {category.productCount === 1 ? "позиция" : "позиций"}
            </span>
            <IconArrowUpRight
              className="absolute bottom-4 right-4 h-5 w-5 text-slate-400 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-slate-950"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
import Link from "next/link";
