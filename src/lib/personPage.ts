import type { MediaItem, PersonCredit, PersonCreditGroup, PersonList } from "@/types/media";
import type { TileLead } from "./tileLead";
import { trustedScore } from "./trust";

/** One decade of a filmography, newest title first. */
export interface DecadeRun<T extends MediaItem = MediaItem> {
  /** "2020s", or null for credits with no release year yet. */
  decade: string | null;
  items: T[];
}

function yearOf(item: MediaItem): number | null {
  const y = Number.parseInt(item.year ?? "", 10);
  return Number.isFinite(y) && y > 1800 ? y : null;
}

/**
 * A department's credits as a timeline: newest year first, split at each
 * decade, with undated credits (announced, no release date) last. The sort is
 * stable, so titles within one year keep the order TMDB's full dates gave
 * them.
 */
export function decadeRuns<T extends MediaItem>(items: readonly T[]): DecadeRun<T>[] {
  const sorted = [...items].sort((a, b) => {
    const ya = yearOf(a);
    const yb = yearOf(b);
    if (ya === yb) return 0;
    if (ya === null) return 1;
    if (yb === null) return -1;
    return yb - ya;
  });
  const runs: DecadeRun<T>[] = [];
  for (const item of sorted) {
    const y = yearOf(item);
    const decade = y === null ? null : `${Math.floor(y / 10) * 10}s`;
    const last = runs[runs.length - 1];
    if (last && last.decade === decade) last.items.push(item);
    else runs.push({ decade, items: [item] });
  }
  return runs;
}

/**
 * The lead of one of this person's /best lists, found among the credits the
 * page already holds: the list's #1 is one of their titles. When it is not
 * there, or has no poster, the tile shows its count on paper instead of
 * guessing at a leader.
 */
export function personListLead(
  list: PersonList,
  groups: readonly PersonCreditGroup[],
): TileLead | null {
  if (!list.leadId) return null;
  for (const g of groups) {
    const it = g.items.find((i) => i.id === list.leadId);
    if (!it) continue;
    if (!it.posterUrl) return null;
    const score = trustedScore(it);
    return {
      id: it.id,
      posterUrl: it.posterUrl,
      swatch: it.swatch ?? null,
      swatchAlt: it.swatchAlt ?? null,
      title: it.title,
      score: typeof score === "number" ? score : null,
      first: true,
    };
  }
  return null;
}

/** A cast credit where the person appears as themselves, hosts or narrates:
 *  talk shows, award broadcasts, documentaries. Matched on the role TMDB
 *  gives, from its start, so "Self - Host" and "Himself (archive footage)"
 *  count and a character named "Selfridge" does not. */
const SELF_ROLE = /^(self|himself|herself|themselves|host|narrator)\b/i;

export function isSelfCredit(item: PersonCredit): boolean {
  return !!item.role && SELF_ROLE.test(item.role.trim());
}

/**
 * Split an acting timeline into the roles and the appearances as themselves,
 * each keeping its order. A credit with no role (a payload cached before
 * roles were kept) stays with the roles, so nothing moves on a guess.
 */
export function splitSelfCredits<T extends PersonCredit>(
  items: readonly T[],
): { roles: T[]; self: T[] } {
  const roles: T[] = [];
  const self: T[] = [];
  for (const it of items) (isSelfCredit(it) ? self : roles).push(it);
  return { roles, self };
}

/**
 * Whether a filmography row links to its title page. Only a credit the
 * catalog join marked as missing goes unlinked; a credit it never reached
 * (the join failed, or the record predates it) keeps its link, so a failed
 * lookup can only leave the page as it was. An id that is not a TMDB number
 * never links, because an empty param leaves "/tv/$id" in the href.
 */
export function creditLinks(item: PersonCredit): boolean {
  if (item.inCatalog === false) return false;
  if (item.mediaType !== "movie" && item.mediaType !== "tv") return false;
  return /^\d+$/.test(item.id.replace(/^(movie|tv)-/, ""));
}

/**
 * Join a person's credits against the catalog rows found for them. A credit
 * the catalog holds becomes its catalog item, which carries the score, and
 * keeps what they did on it; every other credit keeps its TMDB card and is
 * marked as outside the catalog. Call it only after a lookup that succeeded:
 * an empty map means "none of these are in the catalog", not "unknown".
 */
export function joinCatalogCredits<R>(
  groups: readonly PersonCreditGroup[],
  rowsById: ReadonlyMap<string, R>,
  toItem: (row: R) => MediaItem,
): PersonCreditGroup[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item): PersonCredit => {
      const row = rowsById.get(item.id);
      if (!row) return { ...item, inCatalog: false };
      return { ...toItem(row), role: item.role, episodes: item.episodes, inCatalog: true };
    }),
  }));
}
