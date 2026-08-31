// My Library shelves: pure helpers plus the local store.
//
// A shelf is a name and an ORDERED list of media ids; the order is the point.
// Guests keep everything in localStorage; signed-in users get the same shape
// synced to user_shelves (whole-shelf upserts, small rows, no merge drama).
// Every mutation returns a new array so React state stays referentially honest.

export interface Shelf {
  id: string;
  name: string;
  items: string[];
  ts: number;
}

export const SHELF_NAME_MAX = 40;
const KEY = "balasaur:shelves";
/** Set once starter shelves have been offered, so deleting them all stays deleted. */
const SEEDED_KEY = "balasaur:shelves:seeded";

export function readShelves(): Shelf[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return sanitize(parsed);
  } catch {
    return null;
  }
}

export function writeShelves(shelves: Shelf[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(shelves));
  } catch {
    // storage full or blocked: the page still works, it just forgets
  }
}

export function hasBeenSeeded(): boolean {
  try {
    return window.localStorage.getItem(SEEDED_KEY) === "1";
  } catch {
    return false;
  }
}
export function markSeeded(): void {
  try {
    window.localStorage.setItem(SEEDED_KEY, "1");
  } catch {
    // ignore
  }
}

/** Drop malformed rows and per-shelf duplicate ids; never throws on junk. */
export function sanitize(raw: unknown[]): Shelf[] {
  const out: Shelf[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const s = r as Partial<Shelf>;
    if (typeof s.id !== "string" || typeof s.name !== "string") continue;
    const seen = new Set<string>();
    const items = (Array.isArray(s.items) ? s.items : []).filter((id) => {
      if (typeof id !== "string" || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    out.push({
      id: s.id,
      name: s.name.slice(0, SHELF_NAME_MAX),
      items,
      ts: typeof s.ts === "number" ? s.ts : 0,
    });
  }
  return out;
}

export function newShelfId(): string {
  return "s" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
}

export function createShelf(shelves: Shelf[], name: string, items: string[] = []): Shelf[] {
  const clean = name.trim().slice(0, SHELF_NAME_MAX);
  if (!clean) return shelves;
  return [
    ...shelves,
    { id: newShelfId(), name: clean, items: [...new Set(items)], ts: Date.now() },
  ];
}

export function removeShelf(shelves: Shelf[], shelfId: string): Shelf[] {
  return shelves.filter((s) => s.id !== shelfId);
}

export function moveShelf(shelves: Shelf[], shelfId: string, dir: -1 | 1): Shelf[] {
  const i = shelves.findIndex((s) => s.id === shelfId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= shelves.length) return shelves;
  const next = shelves.slice();
  const [sh] = next.splice(i, 1);
  next.splice(j, 0, sh);
  return next;
}

/** Insert id on a shelf at index (end when omitted). A shelf holds one copy;
 *  a title may live on several shelves at once. */
export function placeItem(shelves: Shelf[], shelfId: string, id: string, atIdx?: number): Shelf[] {
  return shelves.map((s) => {
    if (s.id !== shelfId || s.items.includes(id)) return s;
    const items = s.items.slice();
    const idx = atIdx == null || atIdx < 0 || atIdx > items.length ? items.length : atIdx;
    items.splice(idx, 0, id);
    return { ...s, items, ts: Date.now() };
  });
}

export function removeItem(shelves: Shelf[], shelfId: string, id: string): Shelf[] {
  return shelves.map((s) =>
    s.id === shelfId && s.items.includes(id)
      ? { ...s, items: s.items.filter((x) => x !== id), ts: Date.now() }
      : s,
  );
}

/** Reorder within one shelf, or move between shelves, landing at toIdx. */
export function moveItem(
  shelves: Shelf[],
  fromShelfId: string,
  toShelfId: string,
  id: string,
  toIdx: number,
): Shelf[] {
  if (fromShelfId === toShelfId) {
    return shelves.map((s) => {
      if (s.id !== fromShelfId) return s;
      const i = s.items.indexOf(id);
      if (i < 0) return s;
      const items = s.items.slice();
      items.splice(i, 1);
      items.splice(Math.min(toIdx, items.length), 0, id);
      return { ...s, items, ts: Date.now() };
    });
  }
  const target = shelves.find((s) => s.id === toShelfId);
  if (!target || target.items.includes(id)) return shelves;
  return placeItem(removeItem(shelves, fromShelfId, id), toShelfId, id, toIdx);
}

export function nudgeItem(shelves: Shelf[], shelfId: string, id: string, dir: -1 | 1): Shelf[] {
  const sh = shelves.find((s) => s.id === shelfId);
  if (!sh) return shelves;
  const i = sh.items.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sh.items.length) return shelves;
  return moveItem(shelves, shelfId, shelfId, id, j);
}

export function shelvedIdSet(shelves: Shelf[]): Set<string> {
  const set = new Set<string>();
  for (const s of shelves) for (const id of s.items) set.add(id);
  return set;
}

export function shelvesHolding(shelves: Shelf[], id: string): Shelf[] {
  return shelves.filter((s) => s.items.includes(id));
}
