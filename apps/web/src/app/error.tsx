"use client";

import Link from "next/link";
import { IconAlertTriangle, IconHome, IconRefresh } from "@tabler/icons-react";

type AppErrorProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

export default function AppError({ retry }: AppErrorProps) {
  return (
    <>
      <meta name="robots" content="noindex, nofollow" />
      <section className="mx-auto grid min-h-112 w-full max-w-360 place-items-center px-4 py-16 sm:px-6 lg:px-8">
        <div
          className="max-w-2xl border border-slate-200 bg-slate-50 p-7 text-center sm:p-10"
          aria-labelledby="app-error-title"
        >
          <IconAlertTriangle className="mx-auto size-12 text-brand" aria-hidden="true" />
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-brand">
            Техническая ошибка
          </p>
          <h1
            id="app-error-title"
            className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl"
          >
            Не удалось открыть страницу
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-600">
            Попробуйте загрузить данные ещё раз. Если ошибка повторится, вернитесь на главную
            страницу.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={retry}
              className="inline-flex min-h-12 items-center justify-center gap-2 bg-brand px-6 text-sm font-bold text-white transition-colors hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
            >
              <IconRefresh className="size-5" aria-hidden="true" />
              Попробовать ещё раз
            </button>
            <Link
              href="/"
              className="inline-flex min-h-12 items-center justify-center gap-2 border border-slate-300 bg-white px-6 text-sm font-bold text-slate-700 transition-colors hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
            >
              <IconHome className="size-5" aria-hidden="true" />
              На главную
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
