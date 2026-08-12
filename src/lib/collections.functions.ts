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

export interface CollectionSummary extends CollectionRow {
  /** Poster URLs for the hub tile collage (top 4 titles). */
  posters: string[];
}

export const listCollections = createServerFn({ method: "GET" }).handler(
  async (): Promise<CollectionSummary[]> => {
    const { data, error } = await supabaseAdmin
      .from("collections")
      .select(
        "slug, kind, title, item_count, top_score, median_score, newest_title, newest_date, poster_ids",
      )
      .order("item_count", { ascending: false });
    if (error || !data) {
      if (error) console.error("[collections] list failed:", error.message);
      return [];
    }
    const rows = data as (CollectionRow & { poster_ids: string[] })[];

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
      .select("slug, kind, title, item_count, top_score, median_score, newest_title, newest_date")
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
