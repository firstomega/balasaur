import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { onConsentChange } from "@/lib/consent";
import { trackPageView } from "@/lib/analytics";

/**
 * Mounts once at the app root. Loads Google Analytics lazily and only after
 * "all" cookie consent, then reports a page_view on every client-side route
 * change. Renders nothing.
 */
export function AnalyticsManager() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Fires once on mount and on every subsequent route change.
  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);

  // If the visitor grants consent mid-session, start tracking right away.
  useEffect(() => onConsentChange(() => trackPageView(window.location.pathname)), []);

  return null;
}
