// Human-friendly detail URLs. The title slug LEADS (readable when shared) and the
// numeric TMDB id TRAILS as the resolver, e.g. `/tv/fallout-106379`. Keeping the id
// in the URL means no slug registry / DB lookup and zero collision risk. Older links
// — bare id `/tv/106379` or the earlier id-first `/tv/106379-fallout` — still resolve
// and the detail route 301-redirects them to this canonical form.

/** URL-safe slug from a title: lowercase, accent-stripped, hyphenated. */
export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // drop combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, ""); // tidy a trailing dash left by the slice
}

/** Detail route segment: "<slug>-<id>" (title first), or just "<id>" with no title. */
export function mediaSlug(id: string, title?: string | null): string {
  const s = title ? slugify(title) : "";
  return s ? `${s}-${id}` : id;
}

/**
 * Extract the TMDB id from a route segment. Handles the current "<slug>-<id>" form,
 * a bare "<id>", and the earlier "<id>-<slug>" form, in that priority. The id is
 * always a pure-digit chunk; we prefer the trailing chunk (current scheme).
 */
export function parseMediaId(segment: string): string {
  if (/^\d+$/.test(segment)) return segment; // bare id
  const lastDash = segment.lastIndexOf("-");
  const trailing = lastDash >= 0 ? segment.slice(lastDash + 1) : "";
  if (/^\d+$/.test(trailing)) return trailing; // current: "<slug>-<id>"
  const firstDash = segment.indexOf("-");
  const leading = firstDash > 0 ? segment.slice(0, firstDash) : "";
  if (/^\d+$/.test(leading)) return leading; // legacy: "<id>-<slug>"
  return segment;
}
