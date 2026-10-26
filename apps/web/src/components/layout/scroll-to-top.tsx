"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

function scrollToTop() {
  const documentElement = document.documentElement;
  const previousScrollBehavior = documentElement.style.scrollBehavior;

  documentElement.style.scrollBehavior = "auto";
  window.scrollTo(0, 0);
  documentElement.style.scrollBehavior = previousScrollBehavior;
}

export function ScrollToTop() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    scrollToTop();
    const frameId = window.requestAnimationFrame(scrollToTop);

    return () => window.cancelAnimationFrame(frameId);
  }, [pathname]);

  return null;
}
