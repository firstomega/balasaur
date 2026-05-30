/**
 * Cookie consent gate.
 *
 * Strictly necessary cookies (auth/session + the consent record itself) are
 * always allowed. Non-essential cookies (analytics, advertising) must check
 * `getConsent() === "all"` before initializing.
 *
 * Future analytics/ads wiring example:
 *   if (getConsent() === "all") initAnalytics();
 */
export type ConsentChoice = "all" | "required";

const STORAGE_KEY = "balasaur.cookie-consent";
const EVENT = "balasaur:cookie-consent-change";

export function getConsent(): ConsentChoice | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "all" || v === "required" ? v : null;
}

export function setConsent(choice: ConsentChoice) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, choice);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function clearConsent() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function openCookieSettings() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("balasaur:open-cookie-settings"));
}

export function onConsentChange(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}