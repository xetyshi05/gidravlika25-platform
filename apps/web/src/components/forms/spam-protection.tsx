"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { AltchaWidgetElement } from "altcha";
import type {} from "altcha/types/react";
import type { SpamProtectionHandle } from "@/lib/spam-protection";

const challengeUrl = `${(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "")}/requests/challenge`;

// Self-hosted proof of work (ALTCHA): the browser solves a challenge from our
// API when the visitor checks the widget or submits the form. No third-party
// requests, cookies or interaction tracking.
const configuration = JSON.stringify({
  hideFooter: true,
  hideLogo: true,
  humanInteractionSignature: false,
});

type SpamProtectionProps = {
  ref: Ref<SpamProtectionHandle>;
  className?: string;
};

export function SpamProtection({ ref, className }: SpamProtectionProps) {
  const widgetRef = useRef<AltchaWidgetElement>(null);
  const payloadRef = useRef<string | null>(null);
  const loadedRef = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
    // The web component touches `window`, so it is loaded only in the browser.
    loadedRef.current = Promise.all([import("altcha"), import("altcha/i18n/ru")]);
    const widget = widgetRef.current;
    if (!widget) return;
    const onVerified = (event: Event) => {
      const payload = (event as CustomEvent<{ payload?: string }>).detail?.payload;
      payloadRef.current = payload || null;
    };
    const onStateChange = (event: Event) => {
      const state = (event as CustomEvent<{ state?: string }>).detail?.state;
      if (state !== "verified") payloadRef.current = null;
    };
    widget.addEventListener("verified", onVerified);
    widget.addEventListener("statechange", onStateChange);
    return () => {
      widget.removeEventListener("verified", onVerified);
      widget.removeEventListener("statechange", onStateChange);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    async solve(fresh = false) {
      await loadedRef.current;
      await customElements.whenDefined("altcha-widget");
      const widget = widgetRef.current;
      if (!widget) throw new Error("ALTCHA widget is not mounted.");
      if (!fresh && payloadRef.current && widget.getState() === "verified") {
        return payloadRef.current;
      }
      payloadRef.current = null;
      widget.reset();
      const result = await widget.verify();
      if (!result?.payload) throw new Error("ALTCHA verification failed.");
      return result.payload;
    },
    reset() {
      payloadRef.current = null;
      widgetRef.current?.reset();
    },
  }));

  return (
    <altcha-widget
      ref={widgetRef}
      challenge={challengeUrl}
      auto="off"
      language="ru"
      configuration={configuration}
      className={`block shrink-0 ${className ?? ""}`}
    />
  );
}
