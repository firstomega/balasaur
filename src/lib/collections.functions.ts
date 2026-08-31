import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CARD_COLS, rowToCardItem, type CardRow } from "./catalog.functions";
import type { CollectionRow } from "./collectionsProse";
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
    const { data, error } = await supabaseAdmin
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
    const { data, error } = await supabaseAdmin
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

    return rows.map((r) => ({
      ...r,
      posters: (r.poster_ids ?? []).map((id) => posterById.get(id)).filter(Boolean) as string[],
      top_titles: Array.isArray(r.top_titles) ? r.top_titles : [],
    }));
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
    const { data, error } = await supabaseAdmin
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
    const { data, error } = await supabaseAdmin
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

    const { data: row, error } = await supabaseAdmin
      .from("collections")
      .select(
        "slug, kind, title, item_count, top_score, median_score, newest_title, newest_date, updated_at",
      )
      .eq("slug", slug)
      .maybeSingle();
    if (error || !row) return null;

    const { data: itemRows, error: itemsErr } = await supabaseAdmin
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

export interface AppearsIn {
  slug: string;
  title: string;
  rank: number;
  item_count: number;
}

/** Collections a title ranks in — the detail-page interlinking module. */
export const getAppearsIn = createServerFn({ method: "GET" })
  .inputValidator((p: { mediaId: string }) => p)
  .handler(async ({ data: p }): Promise<AppearsIn[]> => {
    if (!/^(movie|tv)-\d{1,10}$/.test(p.mediaId ?? "")) return [];
    const { data, error } = await supabaseAdmin
      .from("collection_items")
      .select("rank, collections:slug ( slug, title, item_count )")
      .eq("media_id", p.mediaId);
    if (error || !data) return [];
    return (
      (
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
        // Best placements first: high rank in a big shelf beats #1 of a tiny one.
        .sort((a, b) => a.rank - b.rank || b.item_count - a.item_count)
        .slice(0, 3)
    );
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
      const { data } = await supabaseAdmin
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
          supabaseAdmin
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
          supabaseAdmin
            .from("collections")
            .select("slug, title, item_count")
            .eq("kind", "genre-service")
            .like("slug", `best-${genre}-on-%`)
            .neq("slug", slug)
            .order("item_count", { ascending: false })
            .limit(3),
          supabaseAdmin
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
    } else {
      const { data } = await supabaseAdmin
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
