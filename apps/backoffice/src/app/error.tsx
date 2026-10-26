"use client";

import Link from "next/link";
import { IconAlertTriangle, IconHome, IconRefresh } from "@tabler/icons-react";

type AppErrorProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

export default function AppError({ retry }: AppErrorProps) {
  return (
    <main className="grid min-h-[70vh] place-items-center px-5 py-10 sm:px-8 lg:px-10">
      <section className="w-full max-w-2xl rounded-md border border-line bg-surface p-7 text-center sm:p-10">
        <IconAlertTriangle className="mx-auto size-11 text-brand" aria-hidden="true" />
        <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.16em] text-brand">
          Ошибка Back Office
        </p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-copy">
          Не удалось загрузить раздел
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-copy-muted sm:text-base">
          Попробуйте повторно загрузить данные. Несохранённые изменения могли быть потеряны.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={retry}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-brand bg-brand px-5 text-sm font-bold text-white hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <IconRefresh className="size-5" aria-hidden="true" />
            Повторить
          </button>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line bg-surface-raised px-5 text-sm font-bold text-copy hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <IconHome className="size-5" aria-hidden="true" />
            На главную
          </Link>
        </div>
      </section>
    </main>
  );
}
