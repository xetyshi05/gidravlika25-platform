"use client";

import Link from "next/link";
import { IconMenu2, IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

type NavigationItem = {
  label: string;
  href: string;
};

export function MobileNavigation({ items }: { items: readonly NavigationItem[] }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const closeMenu = useCallback(() => {
    if (isClosing) return;

    setIsClosing(true);
    window.setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 260);
  }, [isClosing]);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [closeMenu, isOpen]);

  useEffect(() => {
    const desktopBreakpoint = window.matchMedia("(min-width: 1280px)");

    const closeOnDesktop = () => {
      if (!desktopBreakpoint.matches) return;

      setIsOpen(false);
      setIsClosing(false);
    };

    closeOnDesktop();
    desktopBreakpoint.addEventListener("change", closeOnDesktop);

    return () => desktopBreakpoint.removeEventListener("change", closeOnDesktop);
  }, []);

  const menuIsExpanded = isOpen && !isClosing;

  return (
    <div className="xl:hidden">
      <button
        type="button"
        onClick={() => (isOpen ? closeMenu() : setIsOpen(true))}
        aria-expanded={menuIsExpanded}
        aria-controls="mobile-navigation"
        className="grid size-10 cursor-pointer place-items-center rounded-sm text-slate-700 transition-colors duration-200 ease-out hover:bg-red-50 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        aria-label={menuIsExpanded ? "Закрыть меню" : "Открыть меню"}
      >
        <span aria-hidden="true" className="relative grid size-5 place-items-center">
          <IconMenu2
            className={`absolute size-5 transition-all duration-200 ease-out ${menuIsExpanded ? "rotate-90 opacity-0" : "opacity-100"}`}
          />
          <IconX
            className={`absolute size-5 transition-all duration-200 ease-out ${menuIsExpanded ? "rotate-0 opacity-100" : "-rotate-90 opacity-0"}`}
          />
        </span>
      </button>
      {isOpen
        ? createPortal(
            <div
              className={`${isClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"} fixed inset-x-0 bottom-0 top-18 z-[60] overflow-hidden bg-slate-950/30 lg:top-22`}
              onMouseDown={closeMenu}
            >
              <nav
                id="mobile-navigation"
                aria-label="Мобильная навигация"
                className={`${isClosing ? "mobile-navigation-exit" : "mobile-navigation-enter"} h-auto max-h-full overflow-y-auto border-b border-slate-200 bg-white px-4 py-4 shadow-xl sm:px-6`}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="mx-auto grid max-w-360">
                  {items.map((item) => {
                    const active = pathname === item.href;

                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        onClick={closeMenu}
                        aria-current={active ? "page" : undefined}
                        className={`flex min-h-13 items-center border-b border-slate-200 px-1 text-base font-bold transition-colors duration-200 ease-out last:border-b-0 hover:text-brand focus-visible:outline-2 focus-visible:outline-brand ${active ? "text-brand" : "text-slate-800"}`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
                <div className="mx-auto mt-5 grid max-w-360 gap-3">
                  <a
                    href="tel:+79299185147"
                    className="block rounded-sm border-l-2 border-brand pl-3 outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Оптовый отдел
                    </span>
                    <span className="mt-1 block text-base font-black text-slate-950 transition-colors duration-200 ease-out hover:text-brand">
                      +7 (929) 918-51-47
                    </span>
                  </a>
                  <a
                    href="tel:+79253858421"
                    className="block rounded-sm border-l-2 border-brand pl-3 outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Розничный отдел
                    </span>
                    <span className="mt-1 block text-base font-black text-slate-950 transition-colors duration-200 ease-out hover:text-brand">
                      +7 (925) 385-84-21
                    </span>
                  </a>
                </div>
              </nav>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
