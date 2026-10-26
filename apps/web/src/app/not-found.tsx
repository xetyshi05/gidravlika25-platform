import Link from "next/link";
import { IconArrowLeft, IconSearch } from "@tabler/icons-react";

export default function NotFound() {
  return (
    <section className="mx-auto grid min-h-112 max-w-360 place-items-center px-4 py-16 sm:px-6 lg:px-8">
      <div className="max-w-2xl text-center">
        <p className="text-7xl font-black tracking-tight text-brand sm:text-8xl">404</p>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
          Страница не найдена
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-600">
          Возможно, адрес изменился или товар больше не доступен. Перейдите в каталог, чтобы
          продолжить поиск.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/catalog"
            className="inline-flex min-h-12 items-center justify-center gap-2 bg-brand px-6 text-sm font-bold text-white transition-colors hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
          >
            <IconSearch className="size-5" aria-hidden="true" />
            Перейти в каталог
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-12 items-center justify-center gap-2 border border-slate-300 bg-white px-6 text-sm font-bold text-slate-700 transition-colors hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
          >
            <IconArrowLeft className="size-5" aria-hidden="true" />
            На главную
          </Link>
        </div>
      </div>
    </section>
  );
}
