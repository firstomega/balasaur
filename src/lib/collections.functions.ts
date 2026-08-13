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
}

export const listCollections = createServerFn({ method: "GET" }).handler(
  async (): Promise<CollectionSummary[]> => {
    const { data, error } = await supabaseAdmin
      .from("collections")
      .select(
        "slug, kind, title, item_count, top_score, median_score, newest_title, newest_date, poster_ids, top_titles",
      )
      .order("item_count", { ascending: false });
    if (error || !data) {
      if (error) console.error("[collections] list failed:", error.message);
      return [];
    }
    const rows = data as unknown as (CollectionRow & {
      poster_ids: string[];
      top_titles: TopTitle[] | null;
    })[];

    // One lookup for every collage poster (~4 ids × N collections).
    const ids = [...new Set(rows.flatMap((r) => r.poster_ids ?? []))];
    const posterById = new Map<string, string>();
    if (ids.length > 0) {
      const { data: posters } = await supabaseAdmin
        .from("media")
        .select("media_id, poster_url")
        .in("media_id", ids);
      for (const p of (posters ?? []) as { media_id: string; poster_url: string | null }[]) {
        if (p.poster_url) posterById.set(p.media_id, p.poster_url);
      }
    }

    return rows.map((r) => ({
      ...r,
      posters: (r.poster_ids ?? []).map((id) => posterById.get(id)).filter(Boolean) as string[],
      top_titles: Array.isArray(r.top_titles) ? r.top_titles : [],
    }));
  },
);

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
