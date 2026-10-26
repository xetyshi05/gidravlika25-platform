"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { logout } from "@/app/auth-actions";
import type { CurrentUser } from "@/lib/auth";
import {
  BuildingIcon,
  CartIcon,
  ChevronDownIcon,
  ClipboardIcon,
  HomeIcon,
  LogoutIcon,
  ToolIcon,
  UsersIcon,
} from "@/components/icons";
import { RecoveryCodesDialog } from "@/components/recovery-codes-dialog";

type NavigationItemProps = { href: string; label: string; icon: ReactNode; nested?: boolean };

function NavigationItem({ href, label, icon, nested = false }: NavigationItemProps) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group flex min-h-11 items-center gap-3 border-l-2 px-3 text-sm font-bold outline-none transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-brand ${active ? "border-brand text-slate-700" : "border-transparent text-slate-700 hover:bg-red-50 hover:text-brand"} ${nested ? "pl-10 text-[13px]" : ""}`}
    >
      <span
        className={`shrink-0 transition-colors duration-200 ${active ? "text-slate-500" : "text-slate-500 group-hover:text-brand"}`}
      >
        {icon}
      </span>
      {label}
    </Link>
  );
}

export function CrmShell({ children, user }: { children: ReactNode; user: CurrentUser | null }) {
  const [requestsOpen, setRequestsOpen] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!user && pathname !== "/login" && pathname !== "/setup")
      router.replace("/login?error=two-factor-expired");
  }, [pathname, router, user]);
  // Auth pages stay bare even with a session: the session cookie is set before
  // the one-time recovery codes are shown, and the shell must not remount them.
  if (!user || pathname === "/login" || pathname === "/setup")
    return (
      <>
        <a href="#main-content" className="a11y-skip-link">
          Перейти к основному содержимому
        </a>
        <div id="main-content" tabIndex={-1}>
          {children}
        </div>
      </>
    );
  const isRequestsActive = pathname === "/requests";
  return (
    <>
      <a href="#main-content" className="a11y-skip-link">
        Перейти к основному содержимому
      </a>
      <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-r lg:border-b-0">
          <div className="flex h-18 items-center border-b border-slate-200 px-4 sm:px-6 lg:h-22 lg:px-5">
            <Link
              href="/"
              className="flex items-center gap-2.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4"
            >
              <Image
                src="/icon.png"
                alt=""
                width={1254}
                height={1254}
                className="h-9 w-9 object-contain"
              />
              <Image
                src="/logo_text.png"
                alt="Гидравлика 25"
                width={2172}
                height={724}
                className="h-10 w-28 object-contain object-left"
                priority
              />
              <span className="border-l border-slate-200 pl-2 font-days text-sm tracking-wide text-brand">
                CRM
              </span>
            </Link>
          </div>
          <nav
            className="flex gap-1 overflow-x-auto border-b border-slate-200 px-3 py-3 lg:block lg:overflow-visible lg:border-b-0 lg:px-4 lg:py-5"
            aria-label="Основная навигация"
          >
            <NavigationItem href="/" label="Главная" icon={<HomeIcon className="size-5" />} />
            <NavigationItem
              href="/clients"
              label="Клиенты"
              icon={<UsersIcon className="size-5" />}
            />
            <div className="mt-1 lg:mt-3">
              <div
                className={`group flex min-h-11 border-l-2 text-sm font-bold transition-colors duration-200 ease-out ${isRequestsActive ? "border-brand text-slate-700" : "border-transparent text-slate-700 hover:bg-red-50 hover:text-brand"}`}
              >
                <Link
                  href="/requests"
                  aria-current={isRequestsActive ? "page" : undefined}
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                >
                  <ClipboardIcon
                    className={`size-5 shrink-0 transition-colors ${isRequestsActive ? "text-slate-500" : "text-slate-500 group-hover:text-brand"}`}
                  />
                  Заявки
                </Link>
                <button
                  type="button"
                  onClick={() => setRequestsOpen((current) => !current)}
                  aria-label={
                    requestsOpen ? "Скрыть подразделы заявок" : "Показать подразделы заявок"
                  }
                  aria-expanded={requestsOpen}
                  className="grid w-10 place-items-center outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                >
                  <ChevronDownIcon
                    className={`size-4 transition-transform ${requestsOpen ? "rotate-180" : ""}`}
                  />
                </button>
              </div>
              {requestsOpen ? (
                <div className="grid gap-1 py-1">
                  <NavigationItem
                    href="/requests/cart"
                    label="Из корзины"
                    nested
                    icon={<CartIcon className="size-4" />}
                  />
                  <NavigationItem
                    href="/requests/custom"
                    label="Изготовление на заказ"
                    nested
                    icon={<ToolIcon className="size-4" />}
                  />
                  <NavigationItem
                    href="/requests/wholesale"
                    label="Оптовые закупки"
                    nested
                    icon={<BuildingIcon className="size-4" />}
                  />
                </div>
              ) : null}
            </div>
          </nav>
          <div className="hidden border-t border-slate-200 px-5 py-4 lg:mt-auto lg:flex lg:items-start lg:gap-3">
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm leading-5 font-bold text-slate-950">{user.name}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {user.role === "ADMIN" ? "Администратор" : "Менеджер"}
              </p>
            </div>
            <RecoveryCodesDialog />
            <form action={logout} className="ml-auto shrink-0">
              <button
                type="submit"
                aria-label="Выйти из CRM"
                title="Выйти"
                className="grid size-9 place-items-center text-slate-500 transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-brand"
              >
                <LogoutIcon className="size-5" />
              </button>
            </form>
          </div>
        </aside>
        <div id="main-content" tabIndex={-1} className="min-w-0 outline-none">
          {children}
        </div>
      </div>
    </>
  );
}
