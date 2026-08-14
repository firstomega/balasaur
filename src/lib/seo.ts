// Central SEO helpers — canonical origin, meta-tag and JSON-LD builders.
//
// Origin comes from VITE_SITE_URL (public, build-time inlined). Falls back to
// the production custom domain so canonical/sitemap/robots are always absolute
// even if the env var is missing in a given environment.

import { createIsomorphicFn } from "@tanstack/react-start";

const RAW_ORIGIN = (import.meta.env.VITE_SITE_URL as string | undefined) ?? "https://balasaur.com";

/** Canonical origin with no trailing slash, e.g. "https://balasaur.com". */
export const SITE_ORIGIN = RAW_ORIGIN.replace(/\/+$/, "");

export const SITE_NAME = "Balasaur";
export const SITE_TAGLINE = "Your personal entertainment database";
// Fallback share image. Currently the Lovable-hosted preview (a real, working
// URL). TODO: replace with a branded /og-default.png once one is added to public/.
export const DEFAULT_OG_IMAGE =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9ee233a8-7a22-41f0-ac0e-85e583add70d/id-preview-7121fac2--60ec2541-7775-4350-a822-2caaf26ce83a.lovable.app-1780089925441.png";

/** Build an absolute URL from a route path (e.g. "/movie/27205"). */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Truncate to a clean meta-description length on a word boundary. */
export function clampDescription(text: string | undefined, max = 160): string {
  if (!text) return `${SITE_TAGLINE}. Discover, track, and rate movies and TV.`;
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 60 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

export interface MetaTag {
  title?: string;
  name?: string;
  property?: string;
  content?: string;
}

/**
 * Standard meta block: title, description, canonical (as og:url + a link is
 * added separately), Open Graph, and Twitter card. Pass an absolute `url` and
 * (optionally) an absolute `image`.
 */
export function buildMeta(opts: {
  title: string;
  description: string;
  url: string;
  image?: string;
  type?: string;
}): MetaTag[] {
  const { title, description, url } = opts;
  const image = opts.image || DEFAULT_OG_IMAGE;
  const type = opts.type || "website";
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: type },
    { property: "og:url", content: url },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:image", content: image },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ];
}

/** Canonical <link>, for the `links` array of a route head(). */
export function canonicalLink(url: string) {
  return { rel: "canonical", href: url };
}

/**
 * CDN-cache the current SSR response. Call from a route LOADER (server pass
 * only — the guard makes it a no-op during client-side navigation). Detail
 * pages are user-agnostic HTML (auth state renders client-side after
 * hydration), so shared caching is safe; this is the main lever on the
 * 4.6s average Googlebot response time that collapsed the crawl budget.
 * max-age=0 keeps browsers revalidating; s-maxage lets the CDN serve for
 * `seconds`; stale-while-revalidate keeps responses instant during refresh.
 */
const setSsrCacheControl = createIsomorphicFn()
  .client((_value: string) => {})
  .server(async (value: string) => {
    try {
      const { setResponseHeader } = await import("@tanstack/react-start/server");
      setResponseHeader("Cache-Control", value);
    } catch {
      // Outside a request context (prerender/edge quirk) — caching is best-effort.
    }
  });

export async function cacheSsrResponse(seconds = 21600): Promise<void> {
  await setSsrCacheControl(`public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=86400`);
}

/** Meta tag asking crawlers to skip this page (tiered indexation). */
export function noindexMeta(): MetaTag {
  return { name: "robots", content: "noindex, follow" };
}

// The index gate lives in indexability.ts so it stays pure and testable, and
// so media.server.ts can share the same rule without importing this module.
export { CORROBORATION_MIN_VOTES, isCorroborated, isIndexableDetail } from "./indexability";

/** Intent-tuned title/description for movie & TV detail pages: front-load what
 *  searchers type ("watch X", "X streaming") plus the score. */
export function detailMeta(d: {
  title: string;
  year?: string;
  overview?: string;
  streaming?: string[];
  ratings?: { balasaur?: number };
}): { title: string; description: string } {
  const year = d.year ? ` (${d.year})` : "";
  const score = d.ratings?.balasaur;
  const providers = (d.streaming ?? []).slice(0, 3);
  const title =
    `${d.title}${year}: ` +
    (providers.length > 0 ? `Watch on ${providers.join(", ")}` : "Where to Watch") +
    (typeof score === "number" ? ` · Score ${score}` : "") +
    ` | ${SITE_NAME}`;
  const lead =
    (typeof score === "number" ? `Balasaur Score ${score}/100. ` : "") +
    (providers.length > 0 ? `Streaming on ${providers.join(", ")}. ` : "");
  return { title, description: clampDescription(lead + (d.overview ?? ""), 160) };
}

/**
 * Wrap a JSON-LD object for the `scripts` array of a route head().
 * TanStack serializes `children` into a <script type="application/ld+json">.
 */
export function jsonLdScript(data: Record<string, unknown>) {
  return {
    type: "application/ld+json",
    children: JSON.stringify(data),
  };
}
