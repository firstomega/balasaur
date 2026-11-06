import type { MediaItem, PersonCreditGroup, PersonList } from "@/types/media";
import type { TileLead } from "./tileLead";
import { trustedScore } from "./trust";

/** One decade of a filmography, newest title first. */
export interface DecadeRun {
  /** "2020s", or null for credits with no release year yet. */
  decade: string | null;
  items: MediaItem[];
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
export function decadeRuns(items: readonly MediaItem[]): DecadeRun[] {
  const sorted = [...items].sort((a, b) => {
    const ya = yearOf(a);
    const yb = yearOf(b);
    if (ya === yb) return 0;
    if (ya === null) return 1;
    if (yb === null) return -1;
    return yb - ya;
  });
  const runs: DecadeRun[] = [];
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
