// Per-provider watch links.
//
// TMDB exposes exactly one aggregate link per title and region, so for years
// every provider chip opened the same TMDB page while its label named the
// provider. The honest fix, short of licensed deep links: send the click to
// the provider's own search for the title. The user lands inside the service
// they clicked, one query away from pressing play.
//
// Channel storefronts resolve to the platform that actually hosts playback:
// "HBO Max Amazon Channel" plays inside Prime Video, so that is where the
// click goes. Providers with no reliable public search URL return null and
// the chip falls back to the aggregate all-options page.

interface Pattern {
  /** Matched against the normalized provider name (lowercase, alphanumerics). */
  match: RegExp;
  /** Builds the search URL from an already URI-encoded title. */
  url: (encodedTitle: string) => string;
}

// Channel storefronts first: the suffix decides where playback lives, so
// these must win over the brand prefix ("HBO Max Amazon Channel" is Amazon,
// not HBO Max).
const PATTERNS: Pattern[] = [
  { match: /amazonchannel/, url: (t) => `https://www.primevideo.com/search/?phrase=${t}` },
  { match: /appletvchannel/, url: (t) => `https://tv.apple.com/search?term=${t}` },
  { match: /rokuchannel/, url: (t) => `https://therokuchannel.roku.com/search/${t}` },

  { match: /^netflix/, url: (t) => `https://www.netflix.com/search?q=${t}` },
  { match: /^amazonprimevideo/, url: (t) => `https://www.primevideo.com/search/?phrase=${t}` },
  { match: /^amazonvideo/, url: (t) => `https://www.amazon.com/s?k=${t}&i=instant-video` },
  { match: /^disneyplus/, url: (t) => `https://www.disneyplus.com/search?q=${t}` },
  { match: /^hbomax|^max$/, url: (t) => `https://play.hbomax.com/search?q=${t}` },
  { match: /^hulu/, url: (t) => `https://www.hulu.com/search?q=${t}` },
  { match: /^appletv/, url: (t) => `https://tv.apple.com/search?term=${t}` },
  { match: /^paramountplus/, url: (t) => `https://www.paramountplus.com/search/?q=${t}` },
  { match: /^peacock/, url: (t) => `https://www.peacocktv.com/watch/search?q=${t}` },
  { match: /^tubi/, url: (t) => `https://tubitv.com/search/${t}` },
  { match: /^crunchyroll/, url: (t) => `https://www.crunchyroll.com/search?q=${t}` },
  { match: /^plutotv/, url: (t) => `https://pluto.tv/search/details?query=${t}` },
  { match: /^youtube/, url: (t) => `https://www.youtube.com/results?search_query=${t}` },
  {
    match: /^googleplaymovies/,
    url: (t) => `https://play.google.com/store/search?q=${t}&c=movies`,
  },
  { match: /^fandangoathome|^vudu/, url: (t) => `https://www.vudu.com/content/search?q=${t}` },
  { match: /^plex/, url: (t) => `https://watch.plex.tv/search?q=${t}` },
];

function normalize(providerName: string): string {
  return providerName.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * The provider's own search page for this title, or null when no reliable
 * public URL exists (the caller falls back to the aggregate link).
 */
export function providerWatchUrl(providerName: string, title: string): string | null {
  const key = normalize(providerName);
  if (!key || !title) return null;
  const encoded = encodeURIComponent(title);
  for (const p of PATTERNS) {
    if (p.match.test(key)) return p.url(encoded);
  }
  return null;
}
