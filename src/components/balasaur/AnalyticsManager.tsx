import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { getConsent, onConsentChange } from "@/lib/consent";
import { trackPageView } from "@/lib/analytics";
import { stopPostHog, trackPostHogPageView } from "@/lib/posthog";

/**
 * Mounts once at the app root. Loads Google Analytics and PostHog lazily and
 * only after "all" cookie consent, then reports a page view to both on every
 * client-side route change. Renders nothing.
 *
 * Two tools because they answer different questions. GA4 says how many people
 * came and from where. PostHog says what they did once they arrived, through
 * session replay and click autocapture, which is the question worth asking
 * while the first visitors are still countable on one hand.
 */
export function AnalyticsManager() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Fires once on mount and on every subsequent route change.
  useEffect(() => {
    trackPageView(pathname);
    trackPostHogPageView(pathname);
  }, [pathname]);

  // Consent can change mid-session in either direction. Granting starts both
  // tools immediately; withdrawing has to stop PostHog, which unlike GA4 keeps
  // recording once its script is loaded and would otherwise run against a "no".
  useEffect(
    () =>
      onConsentChange(() => {
        if (getConsent() === "all") {
          trackPageView(window.location.pathname);
          trackPostHogPageView(window.location.pathname);
        } else {
          stopPostHog();
        }
      }),
    [],
  );

  return null;
}
