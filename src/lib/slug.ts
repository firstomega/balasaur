// SEO-friendly detail URLs. We keep the numeric TMDB id (the lookup key) and append
// a human/keyword slug, e.g. `/tv/106379-fallout`. The id stays first so resolving is
// trivial (`parseMediaId`) and old id-only links keep working — the detail routes
// 301-redirect them to the canonical slugged URL.

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

/** Detail route segment: "<id>-<slug>", or just "<id>" when there's no usable title. */
export function mediaSlug(id: string, title?: string | null): string {
  const s = title ? slugify(title) : "";
  return s ? `${id}-${s}` : id;
}

/** Extract the TMDB id from a route segment ("<id>-<slug>" or bare "<id>"). */
export function parseMediaId(segment: string): string {
  const m = segment.match(/^\d+/);
  return m ? m[0] : segment;
}
