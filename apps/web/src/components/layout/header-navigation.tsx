"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type NavigationItem = {
  label: string;
  href: string;
};

type IndicatorPosition = {
  left: number;
  width: number;
};

function isActivePath(pathname: string, href: string) {
  return pathname === href;
}

export function HeaderNavigation({ items }: { items: readonly NavigationItem[] }) {
  const pathname = usePathname();
  const navigationRef = useRef<HTMLElement>(null);
  const linkRefs = useRef(new Map<string, HTMLAnchorElement>());
  const [indicatorPosition, setIndicatorPosition] = useState<IndicatorPosition>();

  useLayoutEffect(() => {
    const updateIndicator = () => {
      const activeItem = items.find((item) => isActivePath(pathname, item.href));
      const navigation = navigationRef.current;
      const activeLink = activeItem ? linkRefs.current.get(activeItem.href) : undefined;

      if (!navigation || !activeLink) {
        setIndicatorPosition(undefined);
        return;
      }

      setIndicatorPosition({
        left: activeLink.offsetLeft,
        width: activeLink.offsetWidth,
      });
    };

    updateIndicator();

    const resizeObserver = new ResizeObserver(updateIndicator);

    if (navigationRef.current) {
      resizeObserver.observe(navigationRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [items, pathname]);

  return (
    <nav
      ref={navigationRef}
      aria-label="Основная навигация"
      className="relative hidden h-full items-center gap-5 xl:flex"
    >
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);

        return (
          <Link
            key={item.label}
            href={item.href}
            ref={(element) => {
              if (element) {
                linkRefs.current.set(item.href, element);
              } else {
                linkRefs.current.delete(item.href);
              }
            }}
            aria-current={active ? "page" : undefined}
            className="text-sm font-medium text-slate-600 transition-colors duration-200 ease-out hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
          >
            {item.label}
          </Link>
        );
      })}
      {indicatorPosition ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-6 h-0.5 rounded-full bg-brand transition-[transform,width] duration-300 ease-out"
          style={{
            transform: `translateX(${indicatorPosition.left}px)`,
            width: `${indicatorPosition.width}px`,
          }}
        />
      ) : null}
    </nav>
  );
}
