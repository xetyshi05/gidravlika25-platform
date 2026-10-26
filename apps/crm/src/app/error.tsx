"use client";

import Link from "next/link";
import { IconAlertTriangle, IconHome, IconRefresh } from "@tabler/icons-react";

type AppErrorProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

export default function AppError({ retry }: AppErrorProps) {
  return (
    <main className="mx-auto grid min-h-[70vh] max-w-360 place-items-center px-4 py-10 sm:px-6 lg:px-8">
      <section className="w-full max-w-2xl border border-slate-200 bg-white p-7 text-center sm:p-10">
        <IconAlertTriangle className="mx-auto size-11 text-brand" aria-hidden="true" />
        <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.16em] text-brand">
          Ошибка CRM
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
          Не удалось загрузить раздел
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
          Попробуйте повторно загрузить данные. Введённая информация могла не сохраниться.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={retry}
            className="inline-flex min-h-11 items-center justify-center gap-2 bg-brand px-5 text-sm font-bold text-white hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <IconRefresh className="size-5" aria-hidden="true" />
            Повторить
          </button>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center gap-2 border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <IconHome className="size-5" aria-hidden="true" />
            На главную CRM
          </Link>
        </div>
      </section>
    </main>
  );
}
