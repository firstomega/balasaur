import { themeEchoesSubGenre } from "./taxonomy";
import type { MediaPerson } from "@/types/media";

// The rule for what may sit in a "Movies like X" or "Shows like X" rail.
//
// The candidates come from the related_titles SQL function, which returns up
// to 40 rows ordered by overlap. Overlap alone let Phineas and Ferb the Movie
// onto Inception's page (2026-10-15): it shares "Spy / Espionage" and the
// "Espionage" theme, which are one TMDB keyword written twice, plus three
// broad genres. A card has to share something a viewer would name as the
// reason they might like it:
//
//   * the same franchise, or
//   * a person who made or leads this title (director, creator, writer, or
//     one of its top-billed actors), or
//   * a sub-genre AND a theme that is not that sub-genre said again, from a
//     title in the same register: an animated or family title only reaches a
//     page that is itself animated or family through a person or the
//     franchise. Without that, Stranger Things drew eleven anime series.
//
// Broad genres never qualify a card on their own. A rail with fewer than
// RELATED_RAIL_MIN such cards is not shown, and nothing pads it.

/** Most cards a rail holds. */
export const RELATED_RAIL_MAX = 8;
/** Fewer strong matches than this and the rail is not shown at all. */
export const RELATED_RAIL_MIN = 4;
/** Billing positions that count as a lead. Inception: DiCaprio,
 *  Gordon-Levitt, Watanabe; Tom Hardy (fourth) is supporting. */
export const LEAD_BILLING = 3;

const KEY_CREW_ROLES = new Set(["Director", "Creator", "Writer", "Screenplay"]);

/** Genres that set who a title is for. A candidate carrying one the anchor
 *  lacks is in a different register. */
const REGISTER_GENRES = ["Animation", "Family"];

/** The facets related_titles reports a candidate shares with the anchor. */
export interface RelatedFacets {
  same_franchise: boolean | null;
  shared_people: string[] | null;
  shared_sub_genres: string[] | null;
  shared_themes: string[] | null;
  shared_genres: string[] | null;
  era_match: boolean | null;
  year?: string | null;
  /** The candidate's own genres. */
  genres?: string[] | null;
}

/** What a rail needs to know about the title whose page it is on. */
export interface RailAnchor {
  keyPeople: Set<string>;
  genres: readonly string[];
}

export interface RailAnchorSource {
  genres?: readonly string[];
  cast?: MediaPerson[];
  crew?: MediaPerson[];
  /** Stored shape: directors and creators first, then cast in billing order. */
  people?: MediaPerson[];
}

/** Names of the people who made or lead this title: its directors, creators
 *  and writers, and its top LEAD_BILLING billed actors. */
export function keyPeopleOf(d: RailAnchorSource): Set<string> {
  const out = new Set<string>();
  if ((d.cast?.length ?? 0) + (d.crew?.length ?? 0) > 0) {
    for (const c of d.crew ?? []) if (KEY_CREW_ROLES.has(c.role)) out.add(c.name);
    for (const c of (d.cast ?? []).slice(0, LEAD_BILLING)) out.add(c.name);
    return out;
  }
  let billed = 0;
  for (const p of d.people ?? []) {
    if (KEY_CREW_ROLES.has(p.role)) out.add(p.name);
    else if (billed < LEAD_BILLING) {
      out.add(p.name);
      billed++;
    }
  }
  return out;
}

export function railAnchorOf(d: RailAnchorSource): RailAnchor {
  return { keyPeople: keyPeopleOf(d), genres: d.genres ?? [] };
}

/** Shared themes that are more than a shared sub-genre said twice. */
function distinctThemes(r: RelatedFacets): string[] {
  const subs = r.shared_sub_genres ?? [];
  return (r.shared_themes ?? []).filter((t) => !subs.some((s) => themeEchoesSubGenre(t, s)));
}

function sharedKeyPeople(r: RelatedFacets, key: Set<string>): string[] {
  return (r.shared_people ?? []).filter((p) => key.has(p));
}

function sameRegister(r: RelatedFacets, anchor: RailAnchor): boolean {
  return !(r.genres ?? []).some((g) => REGISTER_GENRES.includes(g) && !anchor.genres.includes(g));
}

/** Whether a candidate has earned a card. See the header for the rule. */
export function isStrongMatch(r: RelatedFacets, anchor: RailAnchor): boolean {
  if (r.same_franchise === true) return true;
  if (sharedKeyPeople(r, anchor.keyPeople).length > 0) return true;
  return (
    (r.shared_sub_genres?.length ?? 0) > 0 &&
    distinctThemes(r).length > 0 &&
    sameRegister(r, anchor)
  );
}

/** Up to three reason chips, most specific first: series, the key people, the
 *  sub-genres, the themes that are not a sub-genre again, then genres. */
export function matchReasons(r: RelatedFacets, key: Set<string>): string[] {
  const out: string[] = [];
  const add = (label: string) => {
    if (!out.some((x) => x.includes(label) || label.includes(x))) out.push(label);
  };
  if (r.same_franchise) out.push("Same series");
  for (const p of sharedKeyPeople(r, key)) add(p);
  for (const s of r.shared_sub_genres ?? []) add(s);
  for (const t of distinctThemes(r)) add(t);
  if (out.length < 3) for (const g of r.shared_genres ?? []) add(g);
  if (out.length < 3 && r.era_match && r.year && /^\d{4}/.test(r.year)) {
    out.push(`${r.year.slice(0, 3)}0s`);
  }
  return out.slice(0, 3);
}

/** The cards a rail shows, in the order given, or undefined for no rail. */
export function selectRail<T extends RelatedFacets>(
  rows: T[],
  anchor: RailAnchor,
): T[] | undefined {
  const strong = rows.filter((r) => isStrongMatch(r, anchor));
  if (strong.length < RELATED_RAIL_MIN) return undefined;
  return strong.slice(0, RELATED_RAIL_MAX);
}
