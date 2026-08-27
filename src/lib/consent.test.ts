import { describe, expect, it } from "bun:test";
import {
  getConsent,
  getConsentRecord,
  setConsent,
  clearConsent,
  CONSENT_TEXT_VERSION,
} from "./consent";

// Minimal localStorage + window stand-in. The module guards on
// `typeof window === "undefined"`, so without this every function no-ops and
// the tests would pass while testing nothing.
const store = new Map<string, string>();
const fakeWindow = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};

/** Bun's type surface here does not expose beforeEach, so setup is explicit. */
function setup() {
  store.clear();
  (globalThis as { window?: unknown }).window = fakeWindow;
  (globalThis as { CustomEvent?: unknown }).CustomEvent = class {
    constructor(public type: string) {}
  };
}

const KEY = "balasaur.cookie-consent";

describe("consent record", () => {
  it("stores the choice, when it was made, and which wording was shown", () => {
    setup();
    setConsent("all");
    const rec = getConsentRecord();
    expect(rec?.choice).toBe("all");
    expect(rec?.version).toBe(CONSENT_TEXT_VERSION);
    expect(Number.isFinite(new Date(rec!.at).getTime())).toBe(true);
    // A bare flag cannot demonstrate consent to anyone who asks.
    expect(store.get(KEY)).toContain('"at"');
  });

  it("reads back both choices", () => {
    setup();
    setConsent("required");
    expect(getConsent()).toBe("required");
    setConsent("all");
    expect(getConsent()).toBe("all");
  });

  it("treats the old bare-string format as no consent, so the visitor is asked again", () => {
    setup();
    store.set(KEY, "all");
    expect(getConsent()).toBe(null);
  });

  it("re-asks when the banner wording changed since the record was stored", () => {
    // The whole point of CONSENT_TEXT_VERSION: a record that agreed to older
    // wording is not consent to the current wording. Written against the
    // constant minus one so a future bump cannot make this test stale.
    clearConsent();
    const recent = new Date().toISOString();
    store.set(
      KEY,
      JSON.stringify({ choice: "all", at: recent, version: CONSENT_TEXT_VERSION - 1 }),
    );
    expect(getConsent()).toBe(null);
    store.set(KEY, JSON.stringify({ choice: "all", at: recent, version: CONSENT_TEXT_VERSION }));
    expect(getConsent()).toBe("all");
  });

  it("expires consent after a year rather than relying on it forever", () => {
    setup();
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    store.set(KEY, JSON.stringify({ choice: "all", at: old, version: CONSENT_TEXT_VERSION }));
    expect(getConsent()).toBe(null);

    const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    store.set(KEY, JSON.stringify({ choice: "all", at: recent, version: CONSENT_TEXT_VERSION }));
    expect(getConsent()).toBe("all");
  });

  it("re-asks when the banner wording has changed under them", () => {
    setup();
    store.set(KEY, JSON.stringify({ choice: "all", at: new Date().toISOString(), version: 0 }));
    expect(getConsent()).toBe(null);
  });

  it("fails closed on anything unreadable", () => {
    setup();
    store.set(KEY, "{not json");
    expect(getConsent()).toBe(null);
    store.set(
      KEY,
      JSON.stringify({
        choice: "maybe",
        at: new Date().toISOString(),
        version: CONSENT_TEXT_VERSION,
      }),
    );
    expect(getConsent()).toBe(null);
    store.set(KEY, JSON.stringify({ choice: "all", version: CONSENT_TEXT_VERSION }));
    expect(getConsent()).toBe(null);
  });

  it("clears completely on withdrawal", () => {
    setup();
    setConsent("all");
    clearConsent();
    expect(getConsent()).toBe(null);
    expect(getConsentRecord()).toBe(null);
  });
});
