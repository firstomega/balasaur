import { createServerFn } from "@tanstack/react-start";
import { loose } from "@/lib/supabaseLoose";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CARD_COLS, rowToCardItem, type CardRow } from "./catalog.functions";
import type { CollectionRow } from "./collectionsProse";
import { buildOriginCollection, listOriginCollections } from "./originCollections";
import { personNameFromListTitle } from "./personLists";
import { pickRanksOn, type Placement } from "./ranksOn";
import { rankByShownScore } from "./sharedRank";
import type { MediaItem } from "@/types/media";
import { asSwatchKey, type SwatchKey } from "./posterSwatch";
import { leadOfItems, type TileLead } from "./tileLead";
import { trustedScore } from "./trust";

export type { TileLead } from "./tileLead";

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
  /** The title whose poster leads the fan, or null when none has a poster. */
  lead: TileLead | null;
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
interface PosterRef {
  poster: string;
  swatch: SwatchKey | null;
  swatchAlt: SwatchKey | null;
  title: string;
  /** Trusted Balasaur Score, or null when the trust rule hides it. */
  score: number | null;
}

async function postersByIds(ids: string[]): Promise<Map<string, PosterRef>> {
  const out = new Map<string, PosterRef>();
  const CHUNK = 400;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await loose(supabaseAdmin)
      .from("media")
      .select(
        "media_id, poster_url, swatch, swatch_alt, title, rating_imdb, rating_rotten_tomatoes, rating_metacritic, rating_tmdb, vote_count",
      )
      .in("media_id", slice)
      .limit(slice.length);
    if (error) {
      console.error("[collections] poster lookup failed:", error.message);
      continue;
    }
    for (const p of (data ?? []) as {
      media_id: string;
      poster_url: string | null;
      swatch: string | null;
      swatch_alt: string | null;
      title: string;
      rating_imdb: number | null;
      rating_rotten_tomatoes: number | null;
      rating_metacritic: number | null;
      rating_tmdb: number | null;
      vote_count: number | null;
    }[]) {
      if (!p.poster_url) continue;
      const score = trustedScore({
        ratings: {
          imdb: p.rating_imdb,
          rottenTomatoes: p.rating_rotten_tomatoes,
          metacritic: p.rating_metacritic,
          tmdb: p.rating_tmdb,
        },
        voteCount: p.vote_count,
      });
      out.set(p.media_id, {
        poster: p.poster_url,
        swatch: asSwatchKey(p.swatch),
        swatchAlt: asSwatchKey(p.swatch_alt),
        title: p.title,
        score: typeof score === "number" ? score : null,
      });
    }
  }
  return out;
}

/** Poster URLs for a list's ids, in list order, skipping titles with none. */
function postersOf(ids: string[], byId: Map<string, PosterRef>): string[] {
  return ids.map((id) => byId.get(id)?.poster).filter((p): p is string => !!p);
}

/** The first title in list order that has a poster, as a tile lead. */
function leadOf(ids: string[], byId: Map<string, PosterRef>): TileLead | null {
  for (let i = 0; i < ids.length; i++) {
    const p = byId.get(ids[i]);
    if (p)
      return {
        id: ids[i],
        posterUrl: p.poster,
        swatch: p.swatch,
        swatchAlt: p.swatchAlt,
        title: p.title,
        score: p.score,
        first: i === 0,
      };
  }
  return null;
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
      posters: postersOf(r.poster_ids ?? [], posterById),
      lead: leadOf(r.poster_ids ?? [], posterById),
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
  /** The title whose poster leads the fan, or null when none has a poster. */
  lead: TileLead | null;
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
      posters: postersOf((r.poster_ids ?? []).slice(0, 3), posterById),
      lead: leadOf((r.poster_ids ?? []).slice(0, 3), posterById),
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
  /** For a person list, the person page it links back to. */
  person?: { id: number; name: string };
  /** Offered to Google: in collection_index_kept with kept = true, or a
   *  country shelf that passed its own gate. Absent when the lookup failed,
   *  which the page treats as not kept. See src/lib/indexKeep.ts. */
  indexable?: boolean;
}

/**
 * The person a person list was built for. The list title is
 * 'The Best <roster name> Movies', and the roster holds that name's TMDB id,
 * which is the id the person page is served under. Nothing when the roster
 * row has no id: a name match alone could point at a namesake.
 */
async function personForList(title: string): Promise<CollectionDetail["person"]> {
  const name = personNameFromListTitle(title);
  if (!name) return undefined;
  const { data, error } = await loose(supabaseAdmin)
    .from("person_collection_roster")
    .select("person_name, person_id")
    .eq("person_name", name)
    .not("person_id", "is", null)
    .limit(1);
  const r = (data as { person_name: string; person_id: number }[] | null)?.[0];
  if (error || !r) return undefined;
  return { id: r.person_id, name: r.person_name };
}

/** Is this materialized list in the kept set? undefined when the read fails. */
async function listIsKept(slug: string): Promise<boolean | undefined> {
  const { data, error } = await loose(supabaseAdmin)
    .from("collection_index_kept")
    .select("kept")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    console.error("[collections] kept-set lookup failed:", error.message);
    return undefined;
  }
  return (data as { kept: boolean } | null)?.kept === true;
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

    const [{ data: itemRows, error: itemsErr }, indexable] = await Promise.all([
      loose(supabaseAdmin)
        .from("collection_items")
        .select(`rank, media:media_id ( ${CARD_COLS} )`)
        .eq("slug", slug)
        .order("rank", { ascending: true }),
      listIsKept(slug),
    ]);
    if (itemsErr) {
      console.error("[collections] items failed:", itemsErr.message);
      return { row: row as CollectionRow, items: [], indexable: false };
    }

    const items = ((itemRows ?? []) as unknown as { rank: number; media: CardRow | null }[])
      .filter((r) => r.media)
      .map((r) => rowToCardItem(r.media as CardRow));
    const collection = row as CollectionRow;
    const person = collection.kind === "person" ? await personForList(collection.title) : undefined;
    return { row: collection, items, indexable, ...(person ? { person } : {}) };
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
   *  in the order the list page prints. Empty when the neighbour read fails;
   *  the caller renders nothing rather than a rail with no numerals to explain
   *  its order. */
  neighbors: ShelfSlot[];
}

/** How many slots of the shelf the detail page shows. */
const SHELF_WINDOW = 10;

/** The run of positions to show around `at` (1-based), clamped to the ends of
 *  the shelf so a title at either end still gets a full window. */
function shelfWindow(at: number, size: number): { lo: number; hi: number } {
  const lo = Math.max(1, at - Math.floor((SHELF_WINDOW - 1) / 2));
  const hi = lo + SHELF_WINDOW - 1;
  if (hi <= size) return { lo, hi };
  return { lo: Math.max(1, size - SHELF_WINDOW + 1), hi: size };
}

/** A list the title holds a place on, with the list's own leader, so the
 *  title page can paint it as a list tile in the leader's colour. */
export interface RankedPlacement extends Placement {
  lead: TileLead | null;
}

/** What a title page shows about the lists it ranks on. */
export interface TitleShelves {
  /** The shelf it ranks best on, with its neighbours, for the closing rail.
   *  Never one of the lists in `ranksOn`: the page names each list once. */
  shelf: AppearsIn | null;
  /** Up to three placements for the "ranks on" tiles, most specific first. */
  ranksOn: RankedPlacement[];
}

const NO_SHELVES: TitleShelves = { shelf: null, ranksOn: [] };

const SCORE_COLS =
  "rating_imdb, rating_rotten_tomatoes, rating_metacritic, rating_tmdb, vote_count";

/** One row of a list as read for ranking: the saved position and the columns
 *  the shown score is made from. */
export interface ListScoreRow {
  media_id: string;
  rank: number;
  media: {
    rating_imdb: number | null;
    rating_rotten_tomatoes: number | null;
    rating_metacritic: number | null;
    rating_tmdb: number | null;
    vote_count: number | null;
  } | null;
}

/** A list's titles in the order its page prints them, each with the rank the
 *  page prints: the same rows the list page reads (saved order, rows whose
 *  title is gone dropped) put through the same rankByShownScore over the same
 *  trusted score. So "#2 of 60" here is the "#2" a reader finds there, ties
 *  included: scores 90, 88, 88, 85 print #1, #2, #2, #4. */
export function sharedRanks(rows: readonly ListScoreRow[]): { id: string; rank: number }[] {
  const kept = rows.filter((r) => r.media).sort((a, b) => a.rank - b.rank);
  return rankByShownScore(kept, (r) =>
    trustedScore({
      ratings: {
        imdb: r.media!.rating_imdb,
        rottenTomatoes: r.media!.rating_rotten_tomatoes,
        metacritic: r.media!.rating_metacritic,
        tmdb: r.media!.rating_tmdb,
      },
      voteCount: r.media!.vote_count,
    }),
  ).map((e) => ({ id: e.item.media_id, rank: e.rank }));
}

/** Rows per request when reading whole lists: under the REST layer's 1,000-row
 *  cap with room for an item count that lags its rows. */
const ROWS_PER_READ = 900;

/** Every row of each list, score columns only, grouped by slug. A title page
 *  asks for at most four lists of at most 60 rows, one request. A list whose
 *  read failed is absent. */
async function listScoreRows(
  lists: { slug: string; item_count: number }[],
): Promise<Map<string, ListScoreRow[]>> {
  const chunks: string[][] = [];
  let cur: string[] = [];
  let curRows = 0;
  for (const l of lists) {
    const n = Math.max(1, l.item_count || 0);
    if (cur.length > 0 && curRows + n > ROWS_PER_READ) {
      chunks.push(cur);
      cur = [];
      curRows = 0;
    }
    cur.push(l.slug);
    curRows += n;
  }
  if (cur.length > 0) chunks.push(cur);

  const out = new Map<string, ListScoreRow[]>();
  await Promise.all(
    chunks.map(async (slugs) => {
      const { data, error } = await loose(supabaseAdmin)
        .from("collection_items")
        .select(`slug, rank, media_id, media:media_id ( ${SCORE_COLS} )`)
        .in("slug", slugs)
        .limit(1000);
      if (error) {
        console.error("[collections] list rows failed:", error.message);
        return;
      }
      for (const r of (data ?? []) as unknown as (ListScoreRow & { slug: string })[]) {
        const list = out.get(r.slug);
        if (list) list.push(r);
        else out.set(r.slug, [r]);
      }
    }),
  );
  return out;
}

/** Every list a title ranks on: the most specific three feed the tiles under
 *  the read, the best placement among the rest and its neighbours feed the
 *  closing rail. Every printed rank is the shared rank the list page prints,
 *  not the saved position, which can differ inside a tie. */
export const getAppearsIn = createServerFn({ method: "GET" })
  .inputValidator((p: { mediaId: string }) => p)
  .handler(async ({ data: p }): Promise<TitleShelves> => {
    if (!/^(movie|tv)-\d{1,10}$/.test(p.mediaId ?? "")) return NO_SHELVES;
    const { data, error } = await loose(supabaseAdmin)
      .from("collection_items")
      .select("rank, collections:slug ( slug, title, kind, item_count, poster_ids )")
      .eq("media_id", p.mediaId);
    if (error || !data) return NO_SHELVES;
    const rows = (
      data as unknown as {
        rank: number;
        collections: {
          slug: string;
          title: string;
          kind: string;
          item_count: number;
          poster_ids: string[] | null;
        } | null;
      }[]
    ).filter((r) => r.collections);
    if (rows.length === 0) return NO_SHELVES;

    // Which lists to show is chosen on the saved positions, as before; only
    // the chosen lists (three tiles and the rail, at most four) are read whole
    // to print the shared rank. Reading every list the title is on cost 557ms
    // for Inception's 12 lists on a cold database cache (11ms warm), against
    // the page's 800ms budget for this lookup.
    const saved: Placement[] = rows.map((r) => ({
      slug: r.collections!.slug,
      title: r.collections!.title,
      kind: r.collections!.kind,
      rank: r.rank,
      item_count: r.collections!.item_count,
    }));
    const tilePicks = pickRanksOn(saved);
    // Best placement first: high rank in a big shelf beats #1 of a tiny one;
    // the slug settles a full tie, so every visitor gets the same rail.
    // A list already shown as a tile is not shown again as the rail.
    const onTiles = new Set(tilePicks.map((pl) => pl.slug));
    const railPick = saved
      .filter((pl) => !onTiles.has(pl.slug))
      .sort(
        (a, b) => a.rank - b.rank || b.item_count - a.item_count || a.slug.localeCompare(b.slug),
      )[0];

    // Each tile is painted from its list's leader, the same lead the list's
    // tile carries everywhere else, so a list looks the same on every page.
    const leadIds = new Map(
      rows.map((r) => [r.collections!.slug, (r.collections!.poster_ids ?? []).slice(0, 3)]),
    );
    // Read alongside the list rows and the shelf neighbours, not before them.
    // A failed read leaves the tiles unpainted rather than failing the page.
    const leadsByIdRead = postersByIds([
      ...new Set(tilePicks.flatMap((pl) => leadIds.get(pl.slug) ?? [])),
    ]).catch(() => new Map<string, PosterRef>());

    // Each chosen list in the order its page prints it. A list whose rows
    // could not be read, or that no longer holds this title, makes no claim.
    const chosen = railPick ? [...tilePicks, railPick] : tilePicks;
    const orderOf = new Map<string, { id: string; rank: number }[]>();
    const byList = await listScoreRows(chosen);
    for (const [slug, listRows] of byList) orderOf.set(slug, sharedRanks(listRows));
    const shared = (pl: Placement): Placement | null => {
      const mine = orderOf.get(pl.slug)?.find((e) => e.id === p.mediaId);
      return mine ? { ...pl, rank: mine.rank } : null;
    };
    const picked = tilePicks.flatMap((pl) => shared(pl) ?? []);
    const leadsRead = leadsByIdRead.then((byId): RankedPlacement[] =>
      picked.map((pl) => ({ ...pl, lead: leadOf(leadIds.get(pl.slug) ?? [], byId) })),
    );
    const best = railPick ? shared(railPick) : null;
    if (!best) return { shelf: null, ranksOn: await leadsRead };

    const order = orderOf.get(best.slug) ?? [];
    const at = order.findIndex((e) => e.id === p.mediaId) + 1;
    const { lo, hi } = shelfWindow(at, order.length);
    const slots = order.slice(lo - 1, hi);
    const [{ data: nearby, error: nearbyErr }, ranksOn] = await Promise.all([
      loose(supabaseAdmin)
        .from("media")
        .select(CARD_COLS)
        .in(
          "media_id",
          slots.map((s) => s.id),
        )
        .limit(slots.length),
      leadsRead,
    ]);
    const shelfOf = (neighbors: ShelfSlot[]): AppearsIn => ({
      slug: best.slug,
      title: best.title,
      rank: best.rank,
      item_count: best.item_count,
      neighbors,
    });
    if (nearbyErr) {
      console.error("[collections] shelf neighbours failed:", nearbyErr.message);
      return { shelf: shelfOf([]), ranksOn };
    }
    const cardById = new Map(((nearby ?? []) as unknown as CardRow[]).map((r) => [r.media_id, r]));
    const neighbors = slots.flatMap((s) => {
      const row = cardById.get(s.id);
      return row ? [{ rank: s.rank, item: rowToCardItem(row) }] : [];
    });
    return { shelf: shelfOf(neighbors), ranksOn };
  });

export interface RelatedCollection {
  slug: string;
  title: string;
  item_count: number;
  /** The list's leading title, for painting its tile. Null when none has a poster. */
  lead: TileLead | null;
}

/** A related-list row as read, before its lead is resolved. */
type RelatedRead = Omit<RelatedCollection, "lead"> & {
  poster_ids?: string[] | null;
  lead?: TileLead | null;
};

export const getRelatedCollections = createServerFn({ method: "GET" })
  .inputValidator((p: { slug: string; kind: string }) => p)
  .handler(async ({ data: p }): Promise<RelatedCollection[]> => {
    const { slug, kind } = p;
    let res: RelatedRead[] = [];

    const fetchSlugs = async (slugs: string[]) => {
      const { data } = await loose(supabaseAdmin)
        .from("collections")
        .select("slug, title, item_count, poster_ids")
        .in("slug", slugs)
        .neq("slug", slug);
      return (data || []) as RelatedRead[];
    };

    if (kind === "genre-service") {
      const match = slug.match(/^best-(.+)-on-(.+)$/);
      if (match) {
        const [, genre, service] = match;
        const [parents, siblings] = await Promise.all([
          fetchSlugs([`best-on-${service}`, `best-${genre}`]),
          loose(supabaseAdmin)
            .from("collections")
            .select("slug, title, item_count, poster_ids")
            .eq("kind", "genre-service")
            .like("slug", `%-on-${service}`)
            .neq("slug", slug)
            .order("item_count", { ascending: false })
            .limit(4),
        ]);
        res = [...parents, ...((siblings.data || []) as RelatedRead[])];
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
            .select("slug, title, item_count, poster_ids")
            .eq("kind", "genre-service")
            .like("slug", `best-${genre}-on-%`)
            .neq("slug", slug)
            .order("item_count", { ascending: false })
            .limit(3),
          loose(supabaseAdmin)
            .from("collections")
            .select("slug, title, item_count, poster_ids")
            .eq("kind", "genre-decade")
            .like("slug", `best-%-${genre}`)
            .neq("slug", slug)
            .order("item_count", { ascending: false })
            .limit(3),
        ]);
        res = [
          ...((services.data || []) as RelatedRead[]),
          ...((decades.data || []) as RelatedRead[]),
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
          .select("slug, title, item_count, poster_ids")
          .eq("kind", "origin-genre")
          .like("slug", `best-${originPart}-%-${suffix}`)
          .order("item_count", { ascending: false })
          .limit(5);
        res = [...((children || []) as RelatedRead[])];
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
              lead: leadOfItems(sibling.items),
            },
          ];
        }
      }
    } else {
      const { data } = await loose(supabaseAdmin)
        .from("collections")
        .select("slug, title, item_count, poster_ids")
        .eq("kind", kind)
        .neq("slug", slug)
        .order("item_count", { ascending: false })
        .limit(6);
      res = (data || []) as RelatedRead[];
    }

    // Deduplicate and limit
    const unique = new Map<string, RelatedRead>();
    for (const item of res) {
      if (!unique.has(item.slug)) unique.set(item.slug, item);
    }
    const picked = Array.from(unique.values()).slice(0, 6);
    const ids = [...new Set(picked.flatMap((r) => r.poster_ids ?? []))];
    const posterById = ids.length ? await postersByIds(ids) : new Map<string, PosterRef>();
    return picked.map((r) => ({
      slug: r.slug,
      title: r.title,
      item_count: r.item_count,
      lead: r.lead !== undefined ? r.lead : leadOf(r.poster_ids ?? [], posterById),
    }));
  });
