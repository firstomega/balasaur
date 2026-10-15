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

/** Methods the page may call before PostHog's script has arrived. Each is
 *  stubbed to record the call; PostHog replays them once it loads. */
const STUBBED_METHODS = ["capture", "opt_out_capturing"] as const;

/**
 * PostHog's placeholder, in the one shape its loader recognises: an array
 * marked `__SV`, with pending `init` calls in `_i` and every other call pushed
 * onto the array itself. Exported so a test can pin that shape; a plain object
 * here is what froze every phone that accepted cookies (see injectPostHog).
 */
export function createPostHogPlaceholder(): PostHogLike & unknown[] & Record<string, unknown> {
  type Pending = unknown[];
  const stub = [] as unknown as Pending[] & Record<string, unknown> & PostHogLike;
  const pendingInits: Pending[] = [];
  for (const method of STUBBED_METHODS) {
    stub[method] = (...args: unknown[]) => {
      stub.push([method, ...args]);
    };
  }
  stub._i = pendingInits;
  stub.init = (token: string, config: Record<string, unknown>) => {
    pendingInits.push([token, config]);
  };
  stub.__SV = 1;
  return stub;
}

/**
 * Set up PostHog's placeholder and request its script.
 *
 * The placeholder has to be exactly the shape PostHog's loader looks for: an
 * array marked `__SV`, holding pending `init` calls in `_i` and every other
 * call as an entry of its own. On arrival the loader recognises that shape,
 * initialises from `_i`, replays the entries, and replaces `window.posthog`
 * with the real library. Nothing on this side replays anything.
 *
 * The version this replaces built a plain object instead and replayed the
 * queue itself once the script loaded. PostHog does not recognise a plain
 * object, so it never replaced it, and the replay pushed each call straight
 * back onto the queue it was iterating. That loop never ended: tapping
 * "Accept all" froze the tab and grew memory by about 300 MB a second until a
 * phone's browser killed it. Every visitor who accepted cookies from 24 August
 * hit it, which is also why PostHog never received a single event.
 */
function injectPostHog(): void {
  if (scriptRequested || typeof window === "undefined") return;
  scriptRequested = true;
  if (window.posthog) return; // already set up by something else; leave it be

  window.posthog = createPostHogPlaceholder();

  window.posthog.init(POSTHOG_TOKEN, {
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

  const s = document.createElement("script");
  s.async = true;
  s.crossOrigin = "anonymous";
  s.src = `${POSTHOG_ASSETS}/static/array.js`;
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
