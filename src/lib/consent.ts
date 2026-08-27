/**
 * Cookie consent gate.
 *
 * Strictly necessary cookies (auth/session + the consent record itself) are
 * always allowed. Non-essential cookies (analytics, advertising) must check
 * `getConsent() === "all"` before initializing.
 *
 * What is stored is a record, not a flag: the choice, when it was made, and
 * which version of the banner wording was on screen at the time. A bare "all"
 * cannot demonstrate consent to anyone who asks, and consent that never
 * expires is consent nobody agreed to recently.
 *
 * This does NOT satisfy Google's EU user consent policy for serving ads in the
 * EEA or UK. That requires a Google-certified Consent Management Platform on
 * the IAB TCF, which is a product to install rather than code to write, and it
 * replaces this banner when ads go live.
 */
export type ConsentChoice = "all" | "required";

const STORAGE_KEY = "balasaur.cookie-consent";
const EVENT = "balasaur:cookie-consent-change";

/** Bump when the banner's wording or the set of purposes on offer changes, so
 *  a stored record says what was actually agreed to rather than just "all". */
export const CONSENT_TEXT_VERSION = 2;

/** Re-ask after this long. Consent is not permanent, and regulators expect it
 *  to be refreshed rather than collected once and relied on forever. */
const CONSENT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export interface ConsentRecord {
  choice: ConsentChoice;
  /** When the visitor chose, ISO 8601. */
  at: string;
  /** Which version of the banner text they were shown. */
  version: number;
}

/** The stored record, or null when there is nothing usable.
 *
 *  Being able to show WHAT was agreed, WHEN, and to WHICH wording is an
 *  obligation, not a nicety: a bare "all" cannot demonstrate anything. Older
 *  records that predate this shape are read as a choice with no date, and
 *  treated as expired so the visitor is asked again on the current wording. */
export function getConsentRecord(): ConsentRecord | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  // The original format was the bare string "all" or "required".
  if (raw === "all" || raw === "required") return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ConsentRecord>;
    if (parsed.choice !== "all" && parsed.choice !== "required") return null;
    if (typeof parsed.at !== "string") return null;
    const age = Date.now() - new Date(parsed.at).getTime();
    if (!Number.isFinite(age) || age > CONSENT_MAX_AGE_MS) return null;
    if (parsed.version !== CONSENT_TEXT_VERSION) return null;
    return { choice: parsed.choice, at: parsed.at, version: parsed.version };
  } catch {
    return null;
  }
}

export function getConsent(): ConsentChoice | null {
  return getConsentRecord()?.choice ?? null;
}

export function setConsent(choice: ConsentChoice) {
  if (typeof window === "undefined") return;
  const record: ConsentRecord = {
    choice,
    at: new Date().toISOString(),
    version: CONSENT_TEXT_VERSION,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
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
