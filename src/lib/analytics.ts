import { getConsent } from "./consent";

// Google Analytics 4. Loaded lazily and ONLY after the visitor has granted
// "all" cookie consent (see src/lib/consent.ts — it anticipates exactly this).
// A GA measurement ID is public by design (it ships in the page of every GA
// site), so it's safe to inline here.
export const GA_MEASUREMENT_ID = "G-MCGQLZGF5Q";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

let scriptInjected = false;
let lastTrackedPath: string | null = null;

function injectGtag() {
  if (scriptInjected || typeof window === "undefined") return;
  scriptInjected = true;

  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  // We send page_view manually (incl. SPA route changes), so turn off the auto one.
  window.gtag("config", GA_MEASUREMENT_ID, { send_page_view: false });
}

/**
 * Record a page view. No-ops unless the visitor has consented to "all"
 * cookies; lazily injects the GA script on the first eligible call.
 */
export function trackPageView(path: string) {
  if (typeof window === "undefined") return;
  if (getConsent() !== "all") return;
  injectGtag();
  if (path === lastTrackedPath) return;
  lastTrackedPath = path;
  window.gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}
