import { getConsent } from "./consent";

// PostHog, loaded the same way GA4 is: lazily, from the CDN, and only after the
// visitor has granted "all" cookie consent.
//
// Loaded as a script rather than the posthog-js npm package on purpose. The
// package is a substantial addition to a client bundle the house rules already
// call heavy, and nothing here needs it at build time. This way an unconsented
// visitor downloads nothing at all.
//
// What this is FOR, which is different from GA4. GA4 answers "how many". This
// answers "what did they do": session replay, and autocapture of clicks. With
// the first twenty real visitors, watching a recording is worth more than any
// dashboard, because the question is whether a stranger understands the site.
//
// Deliberately anonymous. Signed-in users are NOT identified to PostHog, so no
// account identity leaves the site. Returning visitors are still recognised by
// PostHog's own cookie, so retention is measurable without linking behaviour to
// a person. Identifying users is a separate decision with its own privacy
// weight; it is not made here.

// Write-only project token. PostHog's own console labels it "safe to use in
// public apps", and like the GA4 measurement ID it ships in every page anyway.
const POSTHOG_TOKEN = "phc_x3bhikENHUdkdWqLdmis4RyVWe77tv9AT7rkKJ962a8M";
const POSTHOG_HOST = "https://us.i.posthog.com";
const POSTHOG_ASSETS = "https://us-assets.i.posthog.com";

interface PostHogLike {
  init: (token: string, config: Record<string, unknown>) => void;
  capture: (event: string, props?: Record<string, unknown>) => void;
  opt_out_capturing: () => void;
  __loaded?: boolean;
}

declare global {
  interface Window {
    posthog?: PostHogLike;
  }
}

let scriptRequested = false;
let lastTrackedPath: string | null = null;

/** The official snippet, hand-written rather than pasted, so the queue shim is
 *  readable: calls made before the script lands are buffered and replayed. */
function injectPostHog(): void {
  if (scriptRequested || typeof window === "undefined") return;
  scriptRequested = true;

  const queue: [string, unknown[]][] = [];
  const shim = {
    init: () => {},
    capture: (...args: unknown[]) => queue.push(["capture", args]),
    opt_out_capturing: (...args: unknown[]) => queue.push(["opt_out_capturing", args]),
  } as unknown as PostHogLike;
  window.posthog = window.posthog ?? shim;

  const s = document.createElement("script");
  s.async = true;
  s.src = `${POSTHOG_ASSETS}/static/array.js`;
  s.onload = () => {
    const ph = window.posthog;
    if (!ph) return;
    ph.init(POSTHOG_TOKEN, {
      api_host: POSTHOG_HOST,
      ui_host: "https://us.posthog.com",
      // Route changes are reported by hand (see trackPostHogPageView), the same
      // way GA4 is, because a single-page app never fires a real page load.
      capture_pageview: false,
      // No profile is created for an anonymous visitor. Keeps the free tier
      // from filling up with one-off crawlers and drive-by hits.
      person_profiles: "identified_only",
      // The reason this is installed at all.
      disable_session_recording: false,
      session_recording: {
        // Never record what someone typed. Nothing on this site needs it, and
        // the search box would otherwise capture free text.
        maskAllInputs: true,
      },
    });
    for (const [fn, args] of queue) {
      (ph as unknown as Record<string, (...a: unknown[]) => void>)[fn]?.(...args);
    }
    queue.length = 0;
  };
  document.head.appendChild(s);
}

/** Record a route change. No-ops without consent; loads PostHog on the first
 *  eligible call. */
export function trackPostHogPageView(path: string): void {
  if (typeof window === "undefined") return;
  if (getConsent() !== "all") return;
  injectPostHog();
  if (path === lastTrackedPath) return;
  lastTrackedPath = path;
  window.posthog?.capture("$pageview", {
    $current_url: window.location.href,
    path,
  });
}

/** Stop capturing when consent is withdrawn. The script cannot be unloaded, so
 *  PostHog is told to stop rather than left running against a "no". */
export function stopPostHog(): void {
  if (typeof window === "undefined") return;
  window.posthog?.opt_out_capturing();
  lastTrackedPath = null;
}

/** Record a product event. No-ops without consent; loads PostHog on the first
 *  eligible call, exactly like page views. Event names are the funnel:
 *  night_room_created, night_member_joined, night_prefs_ready, night_rolled,
 *  night_marked_watched, night_winner_picked, night_signup_nudge_shown. */
export function capturePostHogEvent(event: string, props?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (getConsent() !== "all") return;
  injectPostHog();
  window.posthog?.capture(event, props);
}
