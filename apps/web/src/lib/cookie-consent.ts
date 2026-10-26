export const COOKIE_CONSENT_STORAGE_KEY = "gidravlika25-cookie-consent-v1";
export const COOKIE_CONSENT_CHANGE_EVENT = "gidravlika25:cookie-consent-change";
export const COOKIE_SETTINGS_OPEN_EVENT = "gidravlika25:cookie-settings-open";

export type CookieConsent = "all" | "necessary";

let sessionConsent: CookieConsent | null = null;

export function readCookieConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    return value === "all" || value === "necessary" ? value : sessionConsent;
  } catch {
    return sessionConsent;
  }
}

export function saveCookieConsent(value: CookieConsent) {
  if (typeof window === "undefined") return;
  sessionConsent = value;
  try {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, value);
  } catch {
    // The choice still applies to the current page when storage is unavailable.
  }
  window.dispatchEvent(
    new CustomEvent<CookieConsent>(COOKIE_CONSENT_CHANGE_EVENT, { detail: value }),
  );
}

export function subscribeCookieConsent(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const handleChange = () => onStoreChange();
  window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, handleChange);
  window.addEventListener("storage", handleChange);
  return () => {
    window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, handleChange);
    window.removeEventListener("storage", handleChange);
  };
}

export function getServerCookieConsent(): CookieConsent | null {
  return null;
}

export function openCookieSettings() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COOKIE_SETTINGS_OPEN_EVENT));
}
