import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  EmptyState,
  EMPTY_ACTION_CLASS,
  EMPTY_ACTION_QUIET_CLASS,
} from "@/components/balasaur/EmptyState";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useShelves } from "@/hooks/useShelves";
import {
  type Shelf,
  SHELF_NAME_MAX,
  createShelf,
  hasBeenSeeded,
  markSeeded,
  moveItem,
  moveShelf,
  newShelfId,
  nudgeItem,
  placeItem,
  removeItem,
  removeShelf,
  shelvedIdSet,
  shelvesHolding,
} from "@/lib/shelves";
import { primaryOf, isNotInterested } from "@/lib/userStatus";
import { tmdbImage } from "@/lib/tmdbImage";
import { mediaSlug } from "@/lib/slug";
import { swatchSurface } from "@/lib/swatchSurface";
import type { SwatchKey } from "@/lib/posterSwatch";
import { usePosterSwatches } from "@/hooks/usePosterSwatches";

// My Library: shelves the visitor arranges by hand, where the order is the
// content. Each shelf is a flat panel with its name as a heading, and each
// title is its poster on a card painted in the poster's swatch, numbered by
// its place. Everything personal renders after mount; the served shell is
// identical for every visitor.

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "My Library · Balasaur" },
      { name: "description", content: "Your shelves: what you loved, ranked your way." },
      { name: "robots", content: "noindex,follow" },
    ],
  }),
  component: LibraryPage,
});

interface PoolItem {
  id: string;
  title: string;
  year: string;
  mediaType: string;
  posterUrl?: string;
  seen: boolean;
  swatch?: SwatchKey | null;
}

// The room's stylesheet, scoped under .libroom. The class names are the drag
// engine's handles (it finds rows, items and posters by them), so they stay.
// A shelf is a ruled panel on the paper, so a painted card and the paper
// tile of a title with no swatch yet both stand out on it. `.target` marks the
// shelf a dragged poster would land on.
const ROOM_CSS = `
.libcase{display:flex; flex-direction:column; gap:12px;}
.libwall{position:relative; border-radius:16px; background:var(--paper); padding:12px 0 4px;
  box-shadow:inset 0 0 0 1px var(--line-strong);}
.libwall.target{box-shadow:inset 0 0 0 2px var(--ink);}
.librow{position:relative; display:flex; align-items:flex-start; gap:10px;
  overflow-x:auto; overflow-y:hidden; min-height:196px; padding:6px 14px 12px;
  scrollbar-width:thin; scrollbar-color:var(--line-strong) transparent;}
.librow::-webkit-scrollbar{height:6px}
.librow::-webkit-scrollbar-thumb{background:var(--line-strong); border-radius:3px}
.libitem{flex:none; width:108px; cursor:grab; border-radius:12px;
  -webkit-touch-callout:none; -webkit-user-select:none; user-select:none; touch-action:pan-x pan-y;}
.libframe{border-radius:12px; padding:6px 6px 4px; transition:transform .12s;}
.libitem:hover .libframe{transform:translateY(-2px)}
.libposter{position:relative; width:96px; height:144px; border-radius:8px; overflow:hidden;
  background:var(--wash-strong); display:flex; align-items:center; justify-content:center;}
.libposter img{width:100%; height:100%; object-fit:cover; display:block; pointer-events:none;}
.libitem.ph{cursor:default}
.libitem.ph .phbox{width:108px; height:174px; border:2px dashed var(--ink); border-radius:12px;}
.libcap{height:20px; display:flex; align-items:center; justify-content:center;
  font-family:var(--font-display); font-weight:800; font-size:15px; line-height:1;}
.libghost{position:fixed; z-index:100; pointer-events:none; width:96px; height:144px; border-radius:8px; overflow:hidden;
  transform:rotate(3deg) scale(1.06); box-shadow:0 10px 22px rgba(0,0,0,.3);}
.libghost img{width:100%; height:100%; object-fit:cover;}
`;

/** A count inside a sentence. Mono is for the figure only: the words beside it
 *  are prose and set in the body face like the rest of the page. */
function Num({ children }: { children: React.ReactNode }) {
  return <span className="font-mono tabular-nums text-text-bright">{children}</span>;
}

function LibraryPage() {
  const { statuses, ready: statusReady } = useUserStatus();
  const { shelves, ready: shelvesReady, update } = useShelves();
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [plaque, setPlaque] = useState<{
    id: string;
    container: string;
    qp?: { shelfId: string; lo: number; hi: number; steps: number };
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // The pool: everything the person has seen or saved, from the snapshots the
  // status store already keeps, so the room renders without a catalog query.
  // The snapshots carry no colour, so the swatches arrive in one lookup after
  // mount and the cards wait on the paper tile until then.
  const filedIds = useMemo(
    () =>
      Object.entries(statuses)
        .filter(([, rec]) => !isNotInterested(rec) && primaryOf(rec))
        .map(([id]) => id),
    [statuses],
  );
  const swatches = usePosterSwatches(filedIds);
  const pool = useMemo(() => {
    const out = new Map<string, PoolItem>();
    for (const [id, rec] of Object.entries(statuses)) {
      if (isNotInterested(rec)) continue;
      const p = primaryOf(rec);
      if (!p) continue;
      const snap = rec.snapshot;
      out.set(id, {
        id,
        title: snap?.title ?? id,
        year: snap?.year ?? "",
        mediaType: snap?.mediaType ?? "movie",
        posterUrl: snap?.posterUrl,
        seen: p === "watched",
        swatch: swatches[id] ?? null,
      });
    }
    return out;
  }, [statuses, swatches]);

  // Starter shelves, once, from what the person already filed. Adding to a
  // made shelf is easier than facing an empty room.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!mounted || !statusReady || !shelvesReady || seededRef.current) return;
    if (shelves.length > 0 || hasBeenSeeded()) {
      seededRef.current = true;
      return;
    }
    const ids = [...pool.values()];
    const wants = ids.filter((x) => !x.seen).map((x) => x.id);
    const seenMovies = ids.filter((x) => x.seen && x.mediaType !== "tv").map((x) => x.id);
    const seenTv = ids.filter((x) => x.seen && x.mediaType === "tv").map((x) => x.id);
    const starters: Shelf[] = [];
    if (wants.length)
      starters.push({
        id: newShelfId(),
        name: "To watch next",
        items: wants.slice(0, 12),
        ts: Date.now(),
      });
    if (seenMovies.length)
      starters.push({
        id: newShelfId(),
        name: "My movie rankings",
        items: seenMovies.slice(0, 10),
        ts: Date.now(),
      });
    if (seenTv.length)
      starters.push({
        id: newShelfId(),
        name: "My TV rankings",
        items: seenTv.slice(0, 10),
        ts: Date.now(),
      });
    seededRef.current = true;
    markSeeded();
    if (starters.length) update(starters);
  }, [mounted, statusReady, shelvesReady, shelves.length, pool, update]);

  const onShelf = shelvedIdSet(shelves);
  const unshelved = [...pool.values()].filter((x) => !onShelf.has(x.id));
  const q = query.trim().toLowerCase();
  const unshelvedShown = q ? unshelved.filter((x) => x.title.toLowerCase().includes(q)) : unshelved;

  const itemFor = useCallback(
    (id: string): PoolItem =>
      pool.get(id) ?? { id, title: "(removed)", year: "", mediaType: "movie", seen: true },
    [pool],
  );

  // ---- drag engine (pointer events; commits through the shelves hook) ----
  const dragRef = useRef<null | {
    id: string;
    from: string;
    itemEl: HTMLElement;
    pointerId: number;
    pointerType: string;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    active: boolean;
    holdTimer: number | null;
    ghost: HTMLElement | null;
    placeholder: HTMLElement | null;
    curRow: HTMLElement | null;
    offsetX: number;
    offsetY: number;
    blockTouch: ((e: TouchEvent) => void) | null;
    raf: number;
  }>(null);
  const suppressClickRef = useRef(false);
  const activateRef = useRef<() => void>(() => {});
  const shelvesLive = useRef(shelves);
  shelvesLive.current = shelves;

  const rowsIn = () =>
    Array.from(document.querySelectorAll<HTMLElement>(".librow[data-container]"));

  const markTarget = (row: HTMLElement | null) => {
    document.querySelectorAll(".libwall.target").forEach((w) => w.classList.remove("target"));
    if (row) row.closest(".libwall")?.classList.add("target");
  };

  const endDrag = useCallback(
    (commitTo?: { container: string; idx: number }) => {
      const d = dragRef.current;
      if (!d) return;
      if (d.holdTimer) window.clearTimeout(d.holdTimer);
      cancelAnimationFrame(d.raf);
      if (d.placeholder?.parentElement) d.placeholder.remove();
      d.ghost?.remove();
      d.itemEl.style.display = "";
      markTarget(null);
      document.body.classList.remove("dragging");
      if (d.blockTouch) document.removeEventListener("touchmove", d.blockTouch);
      const { id, from } = d;
      dragRef.current = null;
      if (!commitTo) return;
      const cur = shelvesLive.current;
      if (commitTo.container === "unshelved") {
        if (from !== "unshelved") update(removeItem(cur, from.slice(6), id));
        return;
      }
      const toShelfId = commitTo.container.slice(6);
      if (from === "unshelved") update(placeItem(cur, toShelfId, id, commitTo.idx));
      else update(moveItem(cur, from.slice(6), toShelfId, id, commitTo.idx));
    },
    [update],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      if (!d.active) {
        const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
        if (d.pointerType === "mouse") {
          if (dist > 5) activate();
        } else if (dist > 8) {
          if (d.holdTimer) window.clearTimeout(d.holdTimer);
          dragRef.current = null;
          return;
        }
        if (!dragRef.current?.active) return;
      }
      if (d.ghost) {
        d.ghost.style.left = d.lastX - d.offsetX + "px";
        d.ghost.style.top = d.lastY - d.offsetY + "px";
      }
      retarget();
    };
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (!d.active) {
        if (d.holdTimer) window.clearTimeout(d.holdTimer);
        dragRef.current = null;
        return;
      }
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      const row = d.placeholder?.parentElement as HTMLElement | null;
      if (!row) {
        endDrag();
        return;
      }
      let idx = 0;
      for (const c of Array.from(row.children)) {
        if (c === d.placeholder) break;
        if (
          c instanceof HTMLElement &&
          c.classList.contains("libitem") &&
          !c.classList.contains("ph") &&
          c !== d.itemEl
        )
          idx++;
      }
      endDrag({ container: row.dataset.container as string, idx });
    };
    const onCancel = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      endDrag();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dragRef.current?.active) endDrag();
    };

    function activate() {
      const d = dragRef.current;
      if (!d || d.active) return;
      void 0;
      d.active = true;
      const posterEl = d.itemEl.querySelector(".libposter") as HTMLElement;
      const r = posterEl.getBoundingClientRect();
      d.offsetX = Math.min(Math.max(d.lastX - r.left, 6), r.width - 6);
      d.offsetY = Math.min(Math.max(d.lastY - r.top, 6), r.height - 6);
      const g = document.createElement("div");
      g.className = "libghost";
      g.innerHTML = posterEl.innerHTML;
      g.style.left = d.lastX - d.offsetX + "px";
      g.style.top = d.lastY - d.offsetY + "px";
      document.body.appendChild(g);
      d.ghost = g;
      const ph = document.createElement("div");
      ph.className = "libitem ph";
      ph.innerHTML = '<div class="phbox"></div>';
      d.placeholder = ph;
      const row = d.itemEl.parentElement as HTMLElement;
      row.insertBefore(ph, d.itemEl);
      d.curRow = row;
      d.itemEl.style.display = "none";
      markTarget(row);
      document.body.classList.add("dragging");
      setPlaque(null);
      d.blockTouch = (ev: TouchEvent) => ev.preventDefault();
      document.addEventListener("touchmove", d.blockTouch, { passive: false });
      try {
        if (navigator.vibrate) navigator.vibrate(10);
      } catch {
        /* ignore */
      }
      const tick = () => {
        const dd = dragRef.current;
        if (!dd || !dd.active) return;
        let moved = false;
        if (dd.curRow) {
          const rr = dd.curRow.getBoundingClientRect();
          if (dd.lastX < rr.left + 54 && dd.curRow.scrollLeft > 0) {
            dd.curRow.scrollLeft -= 10;
            moved = true;
          } else if (dd.lastX > rr.right - 54) {
            dd.curRow.scrollLeft += 10;
            moved = true;
          }
        }
        if (dd.lastY < 90) {
          window.scrollBy(0, -10);
          moved = true;
        } else if (dd.lastY > window.innerHeight - 90) {
          window.scrollBy(0, 10);
          moved = true;
        }
        if (moved) retarget();
        dd.raf = requestAnimationFrame(tick);
      };
      d.raf = requestAnimationFrame(tick);
    }

    function retarget() {
      const d = dragRef.current;
      if (!d || !d.active || !d.placeholder) return;
      let best: HTMLElement | null = null;
      let bestDist = Infinity;
      for (const row of rowsIn()) {
        const r = row.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const cid = row.dataset.container as string;
        if (cid !== d.from && cid !== "unshelved") {
          const sh = shelvesLive.current.find((s) => "shelf:" + s.id === cid);
          if (sh && sh.items.includes(d.id)) continue;
        }
        if (d.lastY >= r.top - 26 && d.lastY <= r.bottom + 26) {
          const dist = Math.abs(d.lastY - (r.top + r.bottom) / 2);
          if (dist < bestDist) {
            bestDist = dist;
            best = row;
          }
        }
      }
      if (!best) return;
      const items = Array.from(best.children).filter(
        (c): c is HTMLElement =>
          c instanceof HTMLElement &&
          c.classList.contains("libitem") &&
          !c.classList.contains("ph") &&
          c !== d.itemEl,
      );
      let idx = items.length;
      for (let i = 0; i < items.length; i++) {
        const r = items[i].getBoundingClientRect();
        if (d.lastX < r.left + r.width / 2) {
          idx = i;
          break;
        }
      }
      const ref = items[idx] ?? null;
      if (d.placeholder.parentElement !== best || d.placeholder.nextSibling !== ref) {
        best.insertBefore(d.placeholder, ref);
        d.curRow = best;
      }
      markTarget(best);
    }

    activateRef.current = activate;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
    };
  }, [endDrag]);

  const onItemPointerDown = (e: React.PointerEvent, id: string, container: string) => {
    if (dragRef.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const itemEl = e.currentTarget as HTMLElement;
    const d = {
      id,
      from: container,
      itemEl,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      active: false,
      holdTimer: null as number | null,
      ghost: null,
      placeholder: null,
      curRow: null,
      offsetX: 0,
      offsetY: 0,
      blockTouch: null,
      raf: 0,
    };
    dragRef.current = d;
    if (e.pointerType !== "mouse") {
      d.holdTimer = window.setTimeout(() => {
        const cur = dragRef.current;
        if (cur === d && !cur.active) activateRef.current();
      }, 240);
    }
  };

  // ---- mutations through the hook ----
  const commit = (next: Shelf[]) => update(next);

  const doNudge = (shelfId: string, id: string, dir: -1 | 1) =>
    commit(nudgeItem(shelvesLive.current, shelfId, id, dir));
  const doFront = (shelfId: string, id: string) =>
    commit(moveItem(shelvesLive.current, shelfId, shelfId, id, 0));
  const doRemove = (shelfId: string, id: string) => {
    setPlaque(null);
    commit(removeItem(shelvesLive.current, shelfId, id));
  };
  const doPlaceEnd = (shelfId: string, id: string) => {
    setPlaque(null);
    commit(placeItem(shelvesLive.current, shelfId, id));
  };

  const stepQuickPlace = (dirAbove: boolean | null) => {
    setPlaque((p) => {
      if (!p?.qp) return p;
      const sh = shelvesLive.current.find((s) => s.id === p.qp!.shelfId);
      if (!sh) return null;
      let { lo, hi, steps } = p.qp;
      if (dirAbove !== null) {
        const mid = (lo + hi) >> 1;
        if (dirAbove) hi = mid;
        else lo = mid + 1;
        steps++;
      }
      if (lo >= hi || steps >= 5) {
        commit(placeItem(shelvesLive.current, sh.id, p.id, lo));
        return null;
      }
      return { ...p, qp: { shelfId: sh.id, lo, hi, steps } };
    });
  };

  const totalShelved = onShelf.size;
  const ready = mounted && statusReady && shelvesReady;
  const empty = statusReady && pool.size === 0;
  // Nothing filed yet means nothing to count.
  const filled = ready && !empty;
  const countParts = [
    shelves.length > 0 && {
      key: "shelves",
      n: shelves.length,
      label: shelves.length === 1 ? "shelf" : "shelves",
    },
    totalShelved > 0 && { key: "shelved", n: totalShelved, label: "on the shelves" },
    unshelved.length > 0 && { key: "waiting", n: unshelved.length, label: "waiting" },
  ].filter(Boolean) as { key: string; n: number; label: string }[];

  return (
    // No min-h-screen here. The root layout already holds the footer at the
    // bottom of a short page; a second full-viewport box inside it made the
    // page exactly one footer taller than the window, so an empty library
    // scrolled 141px into nothing.
    <div className="bg-background text-foreground">
      <style>{ROOM_CSS}</style>
      <div className="libroom">
        <main id="main" className="mx-auto w-full max-w-content px-4 pb-12 pt-6 md:pt-9">
          <header className="mb-5 flex flex-wrap items-end justify-between gap-3 md:mb-6">
            <div>
              <h1 className="font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-text-bright md:text-[64px]">
                My Library
              </h1>
              {/* Three zeros over an empty library said nothing the empty state
                  below did not already say in a sentence, so the line waits
                  until there is something to count, and each figure drops out
                  once it is nothing. "0 waiting" is a number nobody wanted.
                  Numbers keep the mono face; the words around them do not. */}
              {filled && countParts.length > 0 && (
                <p className="mt-2 text-lg text-text-muted">
                  {countParts.map((part, i) => (
                    <span key={part.key}>
                      {i > 0 && " · "}
                      <Num>{part.n}</Num> {part.label}
                    </span>
                  ))}
                </p>
              )}
            </div>
            <Link
              to="/lists"
              className="rounded-full border border-border-strong px-3.5 py-1.5 text-base font-bold text-text-bright hover:border-text-bright"
            >
              My lists
            </Link>
          </header>

          {!ready ? (
            <div className="h-64 animate-pulse rounded-2xl bg-panel" />
          ) : empty ? (
            <EmptyState
              line="Nothing on the shelves yet."
              hint="Mark titles watched, or save them for later. They land here ready to arrange."
              action={
                <>
                  <Link to="/watched" className={EMPTY_ACTION_CLASS}>
                    Rate titles
                  </Link>
                  <Link to="/" className={EMPTY_ACTION_QUIET_CLASS}>
                    Browse the catalog
                  </Link>
                </>
              }
            />
          ) : (
            <>
              <div className="libcase">
                {shelves.map((sh, idx) => (
                  <section key={sh.id} className="libwall">
                    <div className="flex items-start justify-between gap-3 px-4">
                      <h2 className="min-w-0 font-display text-2xl font-extrabold leading-none tracking-tight text-text-bright md:text-3xl">
                        {sh.name}
                      </h2>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="mr-1.5 text-sm font-bold text-text-muted">
                          <span className="font-mono tabular-nums">{sh.items.length}</span>{" "}
                          {sh.items.length === 1 ? "title" : "titles"}
                        </span>
                        <BayTool
                          label={`Move shelf ${sh.name} up`}
                          disabled={idx === 0}
                          onClick={() => commit(moveShelf(shelvesLive.current, sh.id, -1))}
                        >
                          ↑
                        </BayTool>
                        <BayTool
                          label={`Move shelf ${sh.name} down`}
                          disabled={idx === shelves.length - 1}
                          onClick={() => commit(moveShelf(shelvesLive.current, sh.id, 1))}
                        >
                          ↓
                        </BayTool>
                        {sh.items.length === 0 && (
                          <BayTool
                            label={`Remove shelf ${sh.name}`}
                            onClick={() => commit(removeShelf(shelvesLive.current, sh.id))}
                          >
                            ×
                          </BayTool>
                        )}
                      </div>
                    </div>
                    <div className="librow" data-container={`shelf:${sh.id}`}>
                      {sh.items.map((id, i) => (
                        <ShelfItem
                          key={id}
                          item={itemFor(id)}
                          container={`shelf:${sh.id}`}
                          pos={i + 1}
                          total={sh.items.length}
                          shelfName={sh.name}
                          onPointerDown={onItemPointerDown}
                          onOpen={() => {
                            if (!suppressClickRef.current)
                              setPlaque({ id, container: `shelf:${sh.id}` });
                          }}
                          onNudge={(dir) => doNudge(sh.id, id, dir)}
                        />
                      ))}
                      {sh.items.length === 0 && (
                        <div className="m-auto self-center px-2 text-base text-text-dim">
                          Drag a poster here.
                        </div>
                      )}
                    </div>
                  </section>
                ))}
              </div>

              <div className="mt-4">
                {!naming ? (
                  <button
                    type="button"
                    onClick={() => setNaming(true)}
                    className="cursor-pointer rounded-full border border-border-strong px-3.5 py-2 text-base font-bold text-text-bright hover:border-text-bright"
                  >
                    + New shelf
                  </button>
                ) : (
                  <form
                    className="flex flex-wrap items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = newName.trim();
                      if (!name) return;
                      commit(createShelf(shelvesLive.current, name));
                      setNewName("");
                      setNaming(false);
                    }}
                  >
                    <input
                      autoFocus
                      value={newName}
                      maxLength={SHELF_NAME_MAX}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Name the shelf"
                      className="w-[230px] max-w-[60vw] rounded-full border border-border-strong bg-background px-4 py-2 text-lg text-text-bright placeholder:text-text-dim focus:border-text-bright focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!newName.trim()}
                      className="cursor-pointer rounded-full bg-text-bright px-3.5 py-2 text-base font-bold text-background hover:opacity-90 disabled:opacity-30"
                    >
                      Create
                    </button>
                    <button
                      type="button"
                      onClick={() => setNaming(false)}
                      className="cursor-pointer px-2 py-2 text-base font-bold text-text-muted hover:text-text-bright"
                    >
                      Cancel
                    </button>
                  </form>
                )}
              </div>

              {unshelved.length > 0 && (
                <section className="mt-10">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="font-display text-2xl font-extrabold leading-none tracking-tight text-text-bright md:text-3xl">
                      Not on a shelf yet{" "}
                      <span className="font-mono text-base font-normal tabular-nums text-text-muted">
                        {q ? `${unshelvedShown.length} of ${unshelved.length}` : unshelved.length}
                      </span>
                    </h2>
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Find a title"
                      aria-label="Find a title that is not on a shelf"
                      className="ml-auto w-[200px] rounded-full border border-border-strong bg-background px-4 py-1.5 text-base text-text-bright placeholder:text-text-dim focus:border-text-bright focus:outline-none"
                    />
                  </div>
                  <div className="libwall mt-3">
                    <div className="librow" data-container="unshelved">
                      {unshelvedShown.map((it) => (
                        <ShelfItem
                          key={it.id}
                          item={it}
                          container="unshelved"
                          onPointerDown={onItemPointerDown}
                          onOpen={() => {
                            if (!suppressClickRef.current)
                              setPlaque({ id: it.id, container: "unshelved" });
                          }}
                        />
                      ))}
                      {unshelvedShown.length === 0 && (
                        <div className="m-auto self-center text-base text-text-dim">
                          No title here matches.
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      </div>

      {plaque && (
        <Plaque
          state={plaque}
          shelves={shelves}
          itemFor={itemFor}
          onClose={() => setPlaque(null)}
          onNudge={doNudge}
          onFront={doFront}
          onRemove={doRemove}
          onPlaceEnd={doPlaceEnd}
          onSlot={(shelfId) =>
            setPlaque((p) => {
              if (!p) return p;
              const sh = shelves.find((s) => s.id === shelfId);
              if (!sh) return p;
              return { ...p, qp: { shelfId, lo: 0, hi: sh.items.length, steps: 0 } };
            })
          }
          onQuick={stepQuickPlace}
        />
      )}
    </div>
  );
}

function BayTool({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-border-strong bg-background text-base font-bold leading-none text-text-bright hover:border-text-bright disabled:cursor-default disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function ShelfItem({
  item,
  container,
  pos,
  total,
  shelfName,
  onPointerDown,
  onOpen,
  onNudge,
}: {
  item: PoolItem;
  container: string;
  pos?: number;
  total?: number;
  shelfName?: string;
  onPointerDown: (e: React.PointerEvent, id: string, container: string) => void;
  onOpen: () => void;
  onNudge?: (dir: -1 | 1) => void;
}) {
  return (
    <div
      className="libitem group"
      data-id={item.id}
      data-container={container}
      tabIndex={0}
      role="button"
      aria-label={
        item.title +
        (container === "unshelved"
          ? ", not on a shelf"
          : `, position ${pos} of ${total} on ${shelfName}`)
      }
      onPointerDown={(e) => onPointerDown(e, item.id, container)}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        } else if (e.key === "ArrowLeft" && onNudge) {
          e.preventDefault();
          onNudge(-1);
        } else if (e.key === "ArrowRight" && onNudge) {
          e.preventDefault();
          onNudge(1);
        }
      }}
    >
      <div className={"libframe " + swatchSurface(item.swatch)}>
        <div className="libposter">
          {item.posterUrl ? (
            <img src={tmdbImage(item.posterUrl, "w185")} alt="" loading="lazy" draggable={false} />
          ) : (
            <span className="px-2 text-center font-display text-base font-extrabold leading-tight text-text-bright">
              {item.title}
            </span>
          )}
          {onNudge && (
            <>
              <button
                type="button"
                aria-label={`Move ${item.title} left`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onNudge(-1);
                }}
                className={NUDGE + " left-1"}
              >
                ‹
              </button>
              <button
                type="button"
                aria-label={`Move ${item.title} right`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onNudge(1);
                }}
                className={NUDGE + " right-1"}
              >
                ›
              </button>
            </>
          )}
        </div>
        {/* The place on the shelf, in the card's own ink. */}
        <div className="libcap" aria-hidden="true">
          {container === "unshelved" ? "" : pos}
        </div>
      </div>
    </div>
  );
}

/** The left and right nudges on a shelved poster: round paper buttons that
 *  appear under the pointer. */
const NUDGE =
  "absolute top-1 z-[2] hidden h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-text-bright bg-background text-lg font-bold leading-none text-text-bright group-hover:flex";

function Plaque({
  state,
  shelves,
  itemFor,
  onClose,
  onNudge,
  onFront,
  onRemove,
  onPlaceEnd,
  onSlot,
  onQuick,
}: {
  state: {
    id: string;
    container: string;
    qp?: { shelfId: string; lo: number; hi: number; steps: number };
  };
  shelves: Shelf[];
  itemFor: (id: string) => {
    id: string;
    title: string;
    year: string;
    mediaType: string;
    posterUrl?: string;
  };
  onClose: () => void;
  onNudge: (shelfId: string, id: string, dir: -1 | 1) => void;
  onFront: (shelfId: string, id: string) => void;
  onRemove: (shelfId: string, id: string) => void;
  onPlaceEnd: (shelfId: string, id: string) => void;
  onSlot: (shelfId: string) => void;
  onQuick: (dirAbove: boolean | null) => void;
}) {
  const it = itemFor(state.id);
  const onAShelf = state.container !== "unshelved";
  const shelfId = onAShelf ? state.container.slice(6) : null;
  const shelf = shelfId ? shelves.find((s) => s.id === shelfId) : null;
  const idx = shelf ? shelf.items.indexOf(state.id) : -1;
  const holders = shelvesHolding(shelves, state.id);
  const others = holders.filter((s) => s.id !== shelfId);
  const targets = shelves.filter((s) => !s.items.includes(state.id));
  const detailTo = it.mediaType === "tv" ? "/tv/$id" : "/movie/$id";
  const detailId = mediaSlug(state.id.replace(/^(movie|tv)-/, ""), it.title);

  const qpShelf = state.qp ? shelves.find((s) => s.id === state.qp!.shelfId) : null;
  const pivot =
    state.qp && qpShelf ? itemFor(qpShelf.items[(state.qp.lo + state.qp.hi) >> 1]) : null;

  const btn =
    "cursor-pointer rounded-xl border border-border-strong bg-background px-3 py-2 text-left text-base font-bold text-text-bright hover:border-text-bright disabled:cursor-default disabled:opacity-30";

  return (
    <div
      className="fixed inset-0 z-50"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-x-3 bottom-3 mx-auto max-w-[340px] rounded-2xl border-2 border-text-bright bg-background p-4 sm:inset-x-auto sm:right-6 sm:top-24 sm:bottom-auto sm:w-[300px]">
        <div className="flex items-start gap-2">
          <p className="flex-1 font-display text-2xl font-extrabold leading-none tracking-tight text-text-bright">
            {it.title}
          </p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="h-7 w-7 cursor-pointer rounded-full text-lg text-text-muted hover:bg-panel hover:text-text-bright"
          >
            ×
          </button>
        </div>
        <p className="mt-1 font-mono text-sm tabular-nums text-text-muted">
          {it.mediaType === "tv" ? "TV · " : ""}
          {it.year}
        </p>

        {state.qp && qpShelf && pivot ? (
          <div className="mt-3">
            <p className="text-center text-lg text-foreground">
              On <b className="text-text-bright">{qpShelf.name}</b>, above or below this one?
            </p>
            <div className="mx-auto my-2.5 flex h-[74px] w-[120px] items-center justify-center overflow-hidden rounded-lg bg-panel">
              {pivot.posterUrl ? (
                <img
                  src={tmdbImage(pivot.posterUrl, "w185")}
                  alt=""
                  className="h-full w-full object-cover object-top"
                />
              ) : (
                <span className="px-2 text-center text-xs font-bold text-foreground">
                  {pivot.title}
                </span>
              )}
            </div>
            <p className="mb-2 text-center text-sm text-text-muted">{pivot.title}</p>
            <div className="flex gap-2">
              <button
                type="button"
                className={btn + " flex-1 text-center"}
                onClick={() => onQuick(true)}
              >
                Above
              </button>
              <button
                type="button"
                className={btn + " flex-1 text-center"}
                onClick={() => onQuick(false)}
              >
                Below
              </button>
            </div>
            <button
              type="button"
              onClick={() => onPlaceEnd(qpShelf.id, state.id)}
              className="mt-2 w-full cursor-pointer py-1 text-center text-sm font-bold text-text-muted hover:text-text-bright"
            >
              Just add it to the end
            </button>
          </div>
        ) : (
          <>
            {shelf && idx >= 0 && (
              <p className="mt-1 font-mono text-sm tabular-nums text-text-muted">
                Placed {idx + 1} of {shelf.items.length}
                {others.length > 0 && (
                  <>
                    <br />
                    Also on {others.map((s) => s.name).join(" · ")}
                  </>
                )}
              </p>
            )}
            <div className="mt-3 flex flex-col gap-1.5">
              {shelf && idx >= 0 && (
                <>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      className={btn + " flex-1 text-center"}
                      disabled={idx === 0}
                      onClick={() => onNudge(shelf.id, state.id, -1)}
                    >
                      Move left
                    </button>
                    <button
                      type="button"
                      className={btn + " flex-1 text-center"}
                      disabled={idx === shelf.items.length - 1}
                      onClick={() => onNudge(shelf.id, state.id, 1)}
                    >
                      Move right
                    </button>
                  </div>
                  <button
                    type="button"
                    className={btn}
                    disabled={idx === 0}
                    onClick={() => onFront(shelf.id, state.id)}
                  >
                    Move to front
                  </button>
                  <button
                    type="button"
                    className={btn + " text-status-disliked"}
                    onClick={() => onRemove(shelf.id, state.id)}
                  >
                    Take off this shelf
                  </button>
                </>
              )}
              {targets.length > 0 && (
                <>
                  <p className="mt-1 text-sm font-bold text-text-muted">
                    {onAShelf ? "Also place on" : "Place on"}
                  </p>
                  {targets.map((s) => (
                    <div key={s.id} className="flex gap-1.5">
                      <button
                        type="button"
                        className={btn + " flex-1"}
                        onClick={() => onPlaceEnd(s.id, state.id)}
                      >
                        {s.name}
                      </button>
                      {s.items.length >= 3 && (
                        <button
                          type="button"
                          aria-label={`Slot ${it.title} into ${s.name}`}
                          className={btn + " text-sm"}
                          onClick={() => onSlot(s.id)}
                        >
                          Slot it
                        </button>
                      )}
                    </div>
                  ))}
                </>
              )}
              <Link
                to={detailTo}
                params={{ id: detailId }}
                className="mt-1 rounded-full bg-text-bright px-3 py-2 text-center text-base font-bold text-background hover:opacity-90"
              >
                Open title page
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
