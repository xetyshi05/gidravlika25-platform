"use client";

import { useEffect } from "react";

export function TableColumnResizer({ storageKey }: { storageKey: string }) {
  useEffect(() => {
    const table = document.querySelector("main table, table");
    if (!table) return;
    const headers = Array.from(
      table.querySelectorAll<HTMLTableCellElement>("thead tr:first-child th"),
    );
    const cleanup = headers.map((header, index) => {
      if (!index || header.dataset.resizeReady) return () => {};
      header.dataset.resizeReady = "true";
      header.style.position = "relative";
      const handle = document.createElement("button");
      handle.type = "button";
      handle.ariaLabel = "Изменить ширину столбца";
      handle.className = "bo-column-resize";
      header.append(handle);
      const down = (event: PointerEvent) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = header.getBoundingClientRect().width;
        const move = (next: PointerEvent) => {
          header.style.width = `${Math.max(96, startWidth + next.clientX - startX)}px`;
        };
        const up = () => {
          localStorage.setItem(`${storageKey}:width:${index}`, header.style.width);
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      };
      const stored = localStorage.getItem(`${storageKey}:width:${index}`);
      if (stored) header.style.width = stored;
      handle.addEventListener("pointerdown", down);
      return () => {
        handle.removeEventListener("pointerdown", down);
        handle.remove();
        delete header.dataset.resizeReady;
      };
    });
    return () => cleanup.forEach((fn) => fn());
  }, [storageKey]);
  return null;
}
