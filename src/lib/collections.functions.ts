import { createServerFn } from "@tanstack/react-start";
import { loose } from "@/lib/supabaseLoose";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CARD_COLS, rowToCardItem, type CardRow } from "./catalog.functions";
import type { CollectionRow } from "./collectionsProse";
import { buildOriginCollection, listOriginCollections } from "./originCollections";
import type { MediaItem } from "@/types/media";

// Server reads for the programmatic collections layer. The heavy lifting
// (matrix + quality gates + ranking) happens nightly in the DB
// (rebuild_collections(), see the collections migration) — these functions
// only read the materialized rows, so pages stay cheap to SSR and
// CDN-cacheable.

export interface TopTitle {
  title: string;
  score: number | null;
}

export interface CollectionSummary extends CollectionRow {
  /** Poster URLs for the hub fan (top 5 titles, display order). */
  posters: string[];
  /** Top-3 titles with scores, materialized by rebuild_collections(). */
  top_titles: TopTitle[];
  /** Months (1-12) this collection is promoted in; null for evergreen ones. */
  season_months: number[] | null;
  /** "movie" | "tv" for single-type shelves; null for mixed ones. */
  media_type: string | null;
}

/** Resolve poster URLs for a set of media ids.
 *
 * Chunked on purpose. The collections hub asks for every card's collage at
 * once, which is 1,733 distinct ids across 673 shelves, and a single .in()
 * of that size loses rows: the REST layer caps a response at 1,000, so
 * roughly seven hundred ids came back with nothing and their cards rendered
 * with an empty poster fan. It also built a 20KB URL. Chunks bound both.
 */
async function postersByIds(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const CHUNK = 400;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await loose(supabaseAdmin)
      .from("media")
      .select("media_id, poster_url")
      .in("media_id", slice)
      .limit(slice.length);
    if (error) {
      console.error("[collections] poster lookup failed:", error.message);
      continue;
    }
    for (const p of (data ?? []) as { media_id: string; poster_url: string | null }[]) {
      if (p.poster_url) out.set(p.media_id, p.poster_url);
    }
  }
  return out;
}

export const listCollections = createServerFn({ method: "GET" }).handler(
  async (): Promise<CollectionSummary[]> => {
    const { data, error } = await loose(supabaseAdmin)
      .from("collections")
      .select(
        "slug, kind, title, item_count, top_score, median_score, newest_title, newest_date, poster_ids, top_titles, season_months, media_type",
      )
      .order("item_count", { ascending: false });
    if (error || !data) {
      if (error) console.error("[collections] list failed:", error.message);
      return [];
    }
    const rows = data as unknown as (CollectionRow & {
      poster_ids: string[];
      top_titles: TopTitle[] | null;
      season_months: number[] | null;
      media_type: string | null;
    })[];

    // One lookup for every collage poster (~4 ids × N collections).
    const ids = [...new Set(rows.flatMap((r) => r.poster_ids ?? []))];
    const posterById = await postersByIds(ids);

    const materialized = rows.map((r) => ({
      ...r,
      posters: (r.poster_ids ?? []).map((id) => posterById.get(id)).filter(Boolean) as string[],
      top_titles: Array.isArray(r.top_titles) ? r.top_titles : [],
    }));

    // Country shelves are computed at request time (see originCollections.ts)
    // and join the hub here. A materialized row with the same slug would win,
    // so anything already in the table is skipped.
    const have = new Set(materialized.map((r) => r.slug));
    const origins = (await listOriginCollections()).filter((o) => !have.has(o.slug));

    return [...materialized, ...origins].sort((a, b) => b.item_count - a.item_count);
  },
);

export interface HomeCollection {
  slug: string;
  title: string;
  item_count: number;
  kind: string;
  posters: string[];
  inSeason: boolean;
  media_type: string | null;
}

/** How many collections the homepage rail carries. */
const HOME_RAIL_SIZE = 14;

/**
 * Collections for the homepage rail. Occasions lead, and any occasion whose
 * season covers the current month leads those, so October opens with the
 * Halloween list and nobody schedules anything. Services fill the tail.
 *
 * Deliberately lean: three poster ids per card, not the hub's five, and a
 * hard cap, because this rides the homepage loader.
 */
export const listHomeCollections = createServerFn({ method: "GET" }).handler(
  async (): Promise<HomeCollection[]> => {
    const { data, error } = await loose(supabaseAdmin)
      .from("collections")
      .select("slug, title, item_count, kind, poster_ids, season_months, media_type")
      .in("kind", ["occasion", "discovery", "service"])
      .order("item_count", { ascending: false });
    if (error || !data) {
      // Fail soft: the homepage grid stands on its own without the rail.
      if (error) console.error("[collections] home rail failed:", error.message);
      return [];
    }

    const month = new Date().getMonth() + 1;
    const rows = data as unknown as {
      slug: string;
      title: string;
      item_count: number;
      kind: string;
      poster_ids: string[] | null;
      season_months: number[] | null;
      media_type: string | null;
    }[];

    // Seasonal occasions first, then the discovery shelves that used to be
    // their own homepage rails, then everything else.
    const PROMOTED = new Set(["new-and-noteworthy", "hidden-gems"]);
    const rank = (r: (typeof rows)[number]) => {
      if (r.kind === "occasion" && r.season_months?.includes(month)) return 0;
      if (PROMOTED.has(r.slug)) return 1;
      if (r.kind === "occasion") return 2;
      if (r.kind === "discovery") return 3;
      return 4;
    };
    const picked = rows.sort((a, b) => rank(a) - rank(b)).slice(0, HOME_RAIL_SIZE);

    const ids = [...new Set(picked.flatMap((r) => (r.poster_ids ?? []).slice(0, 3)))];
    const posterById = await postersByIds(ids);

    return picked.map((r) => ({
      slug: r.slug,
      title: r.title,
      item_count: r.item_count,
      kind: r.kind,
      inSeason: r.kind === "occasion" && !!r.season_months?.includes(month),
      media_type: r.media_type,
      posters: (r.poster_ids ?? [])
        .slice(0, 3)
        .map((id) => posterById.get(id))
        .filter(Boolean) as string[],
    }));
  },
);

/** Where a retired collection slug now points, or null if it was never used. */
export const getCollectionRedirect = createServerFn({ method: "GET" })
  .inputValidator((p: { slug: string }) => p)
  .handler(async ({ data: p }): Promise<string | null> => {
    const slug = (p.slug ?? "").toLowerCase();
    if (!/^[a-z0-9-]{3,80}$/.test(slug)) return null;
    const { data, error } = await loose(supabaseAdmin)
      .from("collection_redirects")
      .select("to_slug")
      .eq("from_slug", slug)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { to_slug: string }).to_slug;
  });

export interface CollectionDetail {
  row: CollectionRow;
  items: MediaItem[];
}

export const getCollection = createServerFn({ method: "GET" })
  .inputValidator((p: { slug: string }) => p)
  .handler(async ({ data: p }): Promise<CollectionDetail | null> => {
    const slug = (p.slug ?? "").toLowerCase();
    if (!/^[a-z0-9-]{3,80}$/.test(slug)) return null;

    const { data: row, error } = await loose(supabaseAdmin)
      .from("collections")
      .select(
        "slug, kind, title, item_count, top_score, median_score, newest_title, newest_date, updated_at",
      )
      .eq("slug", slug)
      .maybeSingle();
    if (error) return null;
    if (!row) {
      // Not in the materialized matrix: try the request-time country shelves
      // (best-japanese-movies and kin). Returns null, and the route 404s,
      // when the slug is not a country shelf or the quality gate refuses it.
      return buildOriginCollection(slug);
    }

    const { data: itemRows, error: itemsErr } = await loose(supabaseAdmin)
      .from("collection_items")
      .select(`rank, media:media_id ( ${CARD_COLS} )`)
      .eq("slug", slug)
      .order("rank", { ascending: true });
    if (itemsErr) {
      console.error("[collections] items failed:", itemsErr.message);
      return { row: row as CollectionRow, items: [] };
    }

    const items = ((itemRows ?? []) as unknown as { rank: number; media: CardRow | null }[])
      .filter((r) => r.media)
      .map((r) => rowToCardItem(r.media as CardRow));
    return { row: row as CollectionRow, items };
  });

/** One slot on a shelf: the rank and the card that holds it. */
export interface ShelfSlot {
  rank: number;
  item: MediaItem;
}

export interface AppearsIn {
  slug: string;
  title: string;
  rank: number;
  item_count: number;
  /** The run of ranks around this title on the shelf, this title included and
   *  in rank order. Empty when the neighbour read fails; the caller renders
   *  nothing rather than a rail with no numerals to explain its order. */
  neighbors: ShelfSlot[];
}

/** How many slots of the shelf the detail page shows. */
const SHELF_WINDOW = 10;

/** The run of ranks to show around `rank`, clamped to the ends of the shelf so
 *  a title at either end still gets a full window. */
function shelfWindow(rank: number, size: number): { lo: number; hi: number } {
  const lo = Math.max(1, rank - Math.floor((SHELF_WINDOW - 1) / 2));
  const hi = lo + SHELF_WINDOW - 1;
  if (hi <= size) return { lo, hi };
  return { lo: Math.max(1, size - SHELF_WINDOW + 1), hi: size };
}

/** The shelf a title ranks best on, plus its neighbours on that shelf.
 *
 *  One placement, not three: the detail page closes with a single rail, and a
 *  list of shelf names it does not render is payload that rots. */
export const getAppearsIn = createServerFn({ method: "GET" })
  .inputValidator((p: { mediaId: string }) => p)
  .handler(async ({ data: p }): Promise<AppearsIn[]> => {
    if (!/^(movie|tv)-\d{1,10}$/.test(p.mediaId ?? "")) return [];
    const { data, error } = await loose(supabaseAdmin)
      .from("collection_items")
      .select("rank, collections:slug ( slug, title, item_count )")
      .eq("media_id", p.mediaId);
    if (error || !data) return [];
    const best = (
      data as unknown as {
        rank: number;
        collections: { slug: string; title: string; item_count: number } | null;
      }[]
    )
      .filter((r) => r.collections)
      .map((r) => ({
        slug: r.collections!.slug,
        title: r.collections!.title,
        rank: r.rank,
        item_count: r.collections!.item_count,
      }))
      // Best placement first: high rank in a big shelf beats #1 of a tiny one.
      .sort((a, b) => a.rank - b.rank || b.item_count - a.item_count)[0];
    if (!best) return [];

    const size = Math.max(best.item_count || 0, best.rank);
    const { lo, hi } = shelfWindow(best.rank, size);
    const { data: nearby, error: nearbyErr } = await loose(supabaseAdmin)
      .from("collection_items")
      .select(`rank, media:media_id ( ${CARD_COLS} )`)
      .eq("slug", best.slug)
      .gte("rank", lo)
      .lte("rank", hi)
      .order("rank", { ascending: true });
    if (nearbyErr) {
      console.error("[collections] shelf neighbours failed:", nearbyErr.message);
      return [{ ...best, neighbors: [] }];
    }
    const neighbors = ((nearby ?? []) as unknown as { rank: number; media: CardRow | null }[])
      .filter((r) => r.media)
      .map((r) => ({ rank: r.rank, item: rowToCardItem(r.media as CardRow) }));
    return [{ ...best, neighbors }];
  });

export interface RelatedCollection {
  slug: string;
  title: string;
  item_count: number;
}

export const getRelatedCollections = createServerFn({ method: "GET" })
  .inputValidator((p: { slug: string; kind: string }) => p)
  .handler(async ({ data: p }): Promise<RelatedCollection[]> => {
    const { slug, kind } = p;
    let res: RelatedCollection[] = [];

    const fetchSlugs = async (slugs: string[]) => {
      const { data } = await loose(supabaseAdmin)
        .from("collections")
        .select("slug, title, item_count")
        .in("slug", slugs)
        .neq("slug", slug);
      return (data || []) as RelatedCollection[];
    };

    if (kind === "genre-service") {
      const match = slug.match(/^best-(.+)-on-(.+)$/);
      if (match) {
        const [, genre, service] = match;
        const [parents, siblings] = await Promise.all([
          fetchSlugs([`best-on-${service}`, `best-${genre}`]),
          loose(supabaseAdmin)
            .from("collections")
            .select("slug, title, item_count")
            .eq("kind", "genre-service")
            .like("slug", `%-on-${service}`)
            .neq("slug", slug)
            .order("item_count", { ascending: false })
            .limit(4),
        ]);
        res = [...parents, ...((siblings.data || []) as RelatedCollection[])];
      }
    } else if (kind === "genre-decade") {
      const match = slug.match(/^best-(\d{4}s)-(.+)$/);
      if (match) {
        const [, decade, genre] = match;
        const decInt = parseInt(decade);
        res = await fetchSlugs([
          `best-${genre}`,
          `best-of-the-${decade}`,
          `best-${decInt - 10}s-${genre}`,
          `best-${decInt + 10}s-${genre}`,
        ]);
      }
    } else if (kind === "year") {
      const match = slug.match(/^best-of-(\d{4})$/);
      if (match) {
        const year = parseInt(match[1]);
        const decade = Math.floor(year / 10) * 10;
        res = await fetchSlugs([
          `best-of-${year - 1}`,
          `best-of-${year + 1}`,
          `best-of-the-${decade}s`,
        ]);
      }
    } else if (kind === "genre") {
      const match = slug.match(/^best-(.+)$/);
      if (match) {
        const genre = match[1];
        const [services, decades] = await Promise.all([
          loose(supabaseAdmin)
            .from("collections")
            .select("slug, title, item_count")
            .eq("kind", "genre-service")
            .like("slug", `best-${genre}-on-%`)
            .neq("slug", slug)
            .order("item_count", { ascending: false })
            .limit(3),
          loose(supabaseAdmin)
            .from("collections")
            .select("slug, title, item_count")
            .eq("kind", "genre-decade")
            .like("slug", `best-%-${genre}`)
            .neq("slug", slug)
            .order("item_count", { ascending: false })
            .limit(3),
        ]);
        res = [
          ...((services.data || []) as RelatedCollection[]),
          ...((decades.data || []) as RelatedCollection[]),
        ];
      }
    } else if (kind === "origin") {
      // Country shelves are request-time, so their kin live in two places:
      // the materialized origin x genre matrix below them (Japanese horror
      // under Japanese movies), and the same country's other-format shelf,
      // which is request-time like this one.
      const match = slug.match(/^best-([a-z]+)-(movies|shows)$/);
      if (match) {
        const [, originPart, suffix] = match;
        const { data: children } = await loose(supabaseAdmin)
          .from("collections")
          .select("slug, title, item_count")
          .eq("kind", "origin-genre")
          .like("slug", `best-${originPart}-%-${suffix}`)
          .order("item_count", { ascending: false })
          .limit(5);
        res = [...((children || []) as RelatedCollection[])];
        // The Korean drama cross is materialized under its real name, which
        // the pattern above cannot match.
        if (originPart === "korean" && suffix === "shows") {
          res = [...(await fetchSlugs(["best-k-dramas"])), ...res];
        }
        const sibling = await buildOriginCollection(
          `best-${originPart}-${suffix === "movies" ? "shows" : "movies"}`,
        );
        if (sibling) {
          res = [
            ...res,
            {
              slug: sibling.row.slug,
              title: sibling.row.title,
              item_count: sibling.row.item_count,
            },
          ];
        }
      }
    } else {
      const { data } = await loose(supabaseAdmin)
        .from("collections")
        .select("slug, title, item_count")
        .eq("kind", kind)
        .neq("slug", slug)
        .order("item_count", { ascending: false })
        .limit(6);
      res = (data || []) as RelatedCollection[];
    }

    // Deduplicate and limit
    const unique = new Map<string, RelatedCollection>();
    for (const item of res) {
      if (!unique.has(item.slug)) unique.set(item.slug, item);
    }
    return Array.from(unique.values()).slice(0, 6);
  });
