"use client";

import { useEffect, useRef } from "react";

const focusableSelector = [
  "a[href]",
  "button:not(:disabled)",
  "input:not(:disabled):not([type='hidden'])",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function getFocusableElements(container) {
  return Array.from(container.querySelectorAll(focusableSelector)).filter(
    (element) =>
      !element.hidden &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.getClientRects().length > 0,
  );
}

export function useModalAccessibility(dialogRef, onClose, open = true) {
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const inertedElements = [];
    let current = dialog;

    while (current && current !== document.body) {
      const ancestor = current.parentElement;
      if (!ancestor) break;

      for (const sibling of ancestor.children) {
        if (sibling instanceof HTMLElement && sibling !== current && !sibling.inert) {
          sibling.setAttribute("inert", "");
          inertedElements.push(sibling);
        }
      }

      current = ancestor;
    }

    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      const initialFocus =
        dialog.querySelector("[data-modal-initial-focus]") ??
        getFocusableElements(dialog)[0] ??
        dialog;
      initialFocus.focus();
    });

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1);
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      for (const element of inertedElements) {
        if (element.isConnected) element.removeAttribute("inert");
      }
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [dialogRef, open]);
}
