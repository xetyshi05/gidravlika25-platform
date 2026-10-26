"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { IconCookie, IconX } from "@tabler/icons-react";
import {
  COOKIE_SETTINGS_OPEN_EVENT,
  getServerCookieConsent,
  openCookieSettings,
  readCookieConsent,
  saveCookieConsent,
  subscribeCookieConsent,
} from "@/lib/cookie-consent";

const subscribeToHydration = () => () => undefined;

export function CookieBanner() {
  const consent = useSyncExternalStore(
    subscribeCookieConsent,
    readCookieConsent,
    getServerCookieConsent,
  );
  const ready = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const handleOpen = () => setSettingsOpen(true);

    window.addEventListener(COOKIE_SETTINGS_OPEN_EVENT, handleOpen);
    return () => {
      window.removeEventListener(COOKIE_SETTINGS_OPEN_EVENT, handleOpen);
    };
  }, []);

  if (!ready || (consent && !settingsOpen)) return null;

  const choose = (value: "all" | "necessary") => {
    saveCookieConsent(value);
    setSettingsOpen(false);
  };

  return (
    <aside
      role="region"
      aria-labelledby="cookie-banner-title"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-5xl rounded-lg border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-950/20 sm:p-6"
    >
      {settingsOpen && consent ? (
        <button
          type="button"
          onClick={() => setSettingsOpen(false)}
          aria-label="Закрыть настройки cookie"
          className="absolute right-3 top-3 grid size-9 place-items-center rounded text-slate-500 hover:bg-slate-100 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <IconX className="size-5" />
        </button>
      ) : null}
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="flex gap-4 pr-8 md:pr-0">
          <span className="grid size-11 shrink-0 place-items-center rounded-md bg-red-50 text-brand">
            <IconCookie className="size-6" aria-hidden="true" />
          </span>
          <div>
            <h2 id="cookie-banner-title" className="text-base font-black text-slate-950">
              {settingsOpen ? "Настройки cookie" : "Мы используем cookie"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Необходимые технологии обеспечивают работу сайта и корзины. С вашего разрешения мы
              также загружаем Яндекс Карты, которые могут использовать сторонние cookie. Подробнее —
              в{" "}
              <Link
                href="/privacy"
                className="font-bold text-brand underline decoration-brand/30 underline-offset-4 hover:text-brand-dark"
              >
                политике обработки данных
              </Link>
              .
            </p>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row md:justify-end">
          <button
            type="button"
            onClick={() => choose("necessary")}
            className="min-h-11 rounded border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Только необходимые
          </button>
          <button
            type="button"
            onClick={() => choose("all")}
            className="min-h-11 rounded border border-brand bg-brand px-4 text-sm font-bold text-white hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Разрешить все
          </button>
        </div>
      </div>
    </aside>
  );
}

export function CookieSettingsButton() {
  return (
    <button
      type="button"
      onClick={openCookieSettings}
      className="text-left transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
    >
      Настройки cookie
    </button>
  );
}
