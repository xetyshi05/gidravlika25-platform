"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  IconBox,
  IconCategory,
  IconHistory,
  IconHome,
  IconLogout2,
  IconPackages,
  IconPhoto,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";
import { useEffect, useState, type ReactNode } from "react";
import { logout } from "@/app/auth-actions";
import { RecoveryCodesDialog } from "@/components/recovery-codes-dialog";
import { BackofficeApiError, getBackofficeUser } from "@/lib/backoffice-api";
import { isRequestAbort } from "@/lib/fetch-with-timeout";

const catalog = [
  ["/products", "Товары", IconBox],
  ["/categories", "Категории", IconCategory],
  ["/stock", "Остатки", IconPackages],
] as const;
type SessionUser = Awaited<ReturnType<typeof getBackofficeUser>>;

function Item({ href, label, Icon }: { href: string; label: string; Icon: typeof IconHome }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        "flex h-11 items-center gap-3 text-sm font-bold " +
        (active
          ? "backoffice-nav-active border-l-2 pl-3.5 pr-4 text-copy-muted"
          : "px-4 text-copy-muted hover:bg-brand-soft hover:text-brand")
      }
    >
      <Icon aria-hidden="true" className="size-5" />
      {label}
    </Link>
  );
}

export function BackofficeShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => {
    if (path === "/login") return;
    const abortController = new AbortController();
    getBackofficeUser(abortController.signal)
      .then(setUser)
      .catch((error: unknown) => {
        if (isRequestAbort(error)) return;
        if (error instanceof BackofficeApiError && error.status === 401)
          router.replace("/login?error=two-factor-expired");
        setUser(null);
      });
    return () => abortController.abort();
  }, [path, router]);
  if (path === "/login")
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
  return (
    <>
      <a href="#main-content" className="a11y-skip-link">
        Перейти к основному содержимому
      </a>
      <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        <aside className="border-b border-line bg-sidebar lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-b-0 lg:border-r">
          <div className="flex h-20 items-center border-b border-line px-5">
            <Link href="/" className="flex items-center gap-2.5">
              <Image src="/icon.png" alt="" width={1254} height={1254} className="size-9" />
              <Image
                src="/logo_text.png"
                alt="Гидравлика 25"
                width={2172}
                height={724}
                className="h-8 w-28 brightness-0 invert"
              />
              <span className="border-l border-line pl-2 font-days text-[10px] text-brand">
                BACK OFFICE
              </span>
            </Link>
          </div>
          <nav aria-label="Основная навигация" className="p-4">
            <Item href="/" label="Главная" Icon={IconHome} />
            <p className="mt-5 px-4 text-[10px] font-extrabold tracking-[.14em] text-copy-faint">
              КАТАЛОГ
            </p>
            {catalog.map(([href, label, Icon]) => (
              <Item key={href} href={href} label={label} Icon={Icon} />
            ))}
            <p className="mt-5 px-4 text-[10px] font-extrabold tracking-[.14em] text-copy-faint">
              САЙТ
            </p>
            <Item href="/media" label="Медиафайлы" Icon={IconPhoto} />
            <p className="mt-5 px-4 text-[10px] font-extrabold tracking-[.14em] text-copy-faint">
              СИСТЕМА
            </p>
            <Item href="/settings" label="Настройки" Icon={IconSettings} />
            <Item href="/users" label="Пользователи" Icon={IconUsers} />
            <Item href="/activity-log" label="Журнал действий" Icon={IconHistory} />
          </nav>
          <div className="mt-auto flex items-start gap-3 border-t p-5">
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm leading-5 font-bold">{user?.name ?? "Загрузка…"}</p>
              <p className="mt-0.5 text-xs text-copy-muted">
                {user?.role === "ADMIN" ? "Администратор" : "Менеджер"}
              </p>
            </div>
            <RecoveryCodesDialog />
            <form action={logout} className="ml-auto shrink-0">
              <button
                data-tooltip="Выйти"
                aria-label="Выйти"
                className="bo-tooltip grid size-9 place-items-center text-copy-muted hover:text-brand"
              >
                <IconLogout2 className="size-5" />
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
