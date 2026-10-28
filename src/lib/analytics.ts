import { getConsent, onConsentChange } from "./consent";

// Google Analytics 4, run under Google's Consent Mode.
//
// gtag is injected on the first page view for EVERY visitor, with analytics
// and ad storage DENIED by default. In denied mode GA4 receives cookieless
// pings — no cookies are set and nothing is stored on the device — and
// models the traffic from them. When the visitor grants "all" cookie
// consent (see src/lib/consent.ts), a consent update flips storage on and
// measurement becomes exact. A stored "all" from an earlier visit is
// applied as the default, so a returning consented visitor is measured in
// full from the first hit.
//
// Why this changed (2026-10): GA previously loaded only AFTER consent, so
// most visitors — strangers arriving from search who never touch the
// banner — were completely invisible, and every traffic report
// structurally undercounted exactly the audience the site needs to see.
// Consent Mode is the sanctioned way to count visits while storing nothing
// before consent. PostHog deliberately stays consent-gated (posthog.ts):
// session replay is behavioural recording, not visit counting, and does
// not get the same pass.
//
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

/** The consent state GA should be in right now, from the stored record. */
function gaConsentState(): Record<string, "granted" | "denied"> {
  const value = getConsent() === "all" ? "granted" : "denied";
  return {
    analytics_storage: value,
    ad_storage: value,
    ad_user_data: value,
    ad_personalization: value,
  };
}

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
  // The consent default must be declared before config so the first hit
  // already honours it. It reflects any stored choice; absent one, denied.
  window.gtag("consent", "default", gaConsentState());
  // We send page_view manually (incl. SPA route changes), so turn off the auto one.
  window.gtag("config", GA_MEASUREMENT_ID, { send_page_view: false });
  // Keep GA in step when the visitor answers (or re-answers) the banner.
  onConsentChange(() => {
    window.gtag("consent", "update", gaConsentState());
  });
}

/**
 * Record a page view. Sent for every visitor: before consent it travels as
 * a cookieless ping (counted and modelled by GA; nothing is stored on the
 * device), and after "all" consent it is a full measurement hit. Lazily
 * injects the GA script on the first call.
 */
export function trackPageView(path: string) {
  if (typeof window === "undefined") return;
  injectGtag();
  if (path === lastTrackedPath) return;
  lastTrackedPath = path;
  window.gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}
