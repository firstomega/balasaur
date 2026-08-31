import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
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

// My Library: the reading room. Shelves are hand-arranged, the order is the
// content, and the room is drawn in CSS (SVG-noise wood grain, brass plates,
// picture lights) so it ships no images of its own. Everything personal
// renders after mount; the served shell is identical for every visitor.

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
}

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='460' height='460'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.010 0.16' numOctaves='3' seed='7'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.55 0.22 0.08 0 0'/%3E%3C/filter%3E%3Crect width='460' height='460' filter='url(%23g)'/%3E%3C/svg%3E\")";
const BAYTEX =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='420' height='420'%3E%3Cfilter id='b'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.012 0.2' numOctaves='2' seed='3'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.35 0.15 0.06 0 0'/%3E%3C/filter%3E%3Crect width='420' height='420' filter='url(%23b)'/%3E%3C/svg%3E\")";
const BOARDTEX =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='460' height='60'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.012 0.3' numOctaves='2' seed='9'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0.2 0.08 0 0'/%3E%3C/filter%3E%3Crect width='460' height='60' filter='url(%23g)'/%3E%3C/svg%3E\")";

// The room's stylesheet. Scoped under .libroom so the rest of the site keeps
// its terminal palette; the reading room is one warm island.
const ROOM_CSS = `
.libroom{position:relative; overflow:hidden;
  background:
    radial-gradient(120% 70% at 50% -4%, rgba(214,166,96,.13), transparent 60%),
    radial-gradient(90% 55% at 50% 8%, rgba(190,142,80,.09), transparent 70%),
    #15100c;
}
.libroom.late{background:
    radial-gradient(120% 70% at 50% -4%, rgba(214,166,96,.07), transparent 60%),
    #0e0b08;}
.libroom .vig{position:absolute; inset:0; pointer-events:none; z-index:30;
  background:radial-gradient(130% 90% at 50% 30%, transparent 55%, rgba(0,0,0,.5) 100%);}
.libroom{--lampglow:.17}
.libroom.late{--lampglow:.27}
.libcase{position:relative; border-radius:8px; padding:14px 14px 18px;
  background:
    linear-gradient(180deg, rgba(255,214,150,.10), rgba(0,0,0,.28) 30%, rgba(0,0,0,.45)),
    ${GRAIN},
    linear-gradient(180deg,#5a3d22,#462e18 45%,#33200f);
  box-shadow:
    inset 0 1px 0 rgba(255,220,160,.22), inset 0 0 0 1px rgba(0,0,0,.55),
    inset 0 -2px 6px rgba(0,0,0,.5), 0 30px 60px -18px rgba(0,0,0,.85), 0 8px 22px rgba(0,0,0,.6);}
.libbay{position:relative; border-radius:3px 3px 0 0; overflow:hidden;
  background:
    radial-gradient(75% 95% at 50% 0%, rgba(255,186,106,calc(var(--lampglow) * 1.6 + .03)), transparent 64%),
    ${BAYTEX},
    linear-gradient(180deg,#241811 0%, #1c120b 55%, #170e08);
  box-shadow:
    inset 0 14px 22px -12px rgba(0,0,0,.9),
    inset 12px 0 18px -14px rgba(0,0,0,.85),
    inset -12px 0 18px -14px rgba(0,0,0,.85);}
.libwall.target .libbay{box-shadow:
    inset 0 14px 22px -12px rgba(0,0,0,.9), inset 12px 0 18px -14px rgba(0,0,0,.85),
    inset -12px 0 18px -14px rgba(0,0,0,.85), inset 0 0 0 1px rgba(59,130,246,.55);}
.liblamp{position:absolute; top:0; left:50%; transform:translateX(-50%);
  width:132px; height:5px; border-radius:0 0 4px 4px; z-index:3;
  background:linear-gradient(180deg,#e8c887,#a97f3c 60%,#6e5122);
  box-shadow:0 1px 0 rgba(0,0,0,.6), 0 5px 26px 4px rgba(255,190,110,calc(var(--lampglow) * 2.6)), inset 0 -1px 1px rgba(0,0,0,.4);}
.libplate{position:absolute; left:50%; top:11px; transform:translateX(-50%); z-index:4;
  max-width:72%; padding:1px 22px; border-radius:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  background:linear-gradient(180deg,#e9cd93 0%, #c8a057 40%, #96712f 85%, #b28c46 100%);
  box-shadow:inset 0 1px 1px rgba(255,255,255,.55), inset 0 -1px 2px rgba(70,45,10,.7), 0 1px 3px rgba(0,0,0,.7);
  font-family:Georgia,'Times New Roman',serif; font-weight:600; font-size:13.5px; letter-spacing:.13em;
  font-variant:small-caps; text-align:center; color:#41290c; text-shadow:0 1px 0 rgba(255,235,190,.5);}
.libplate::before,.libplate::after{content:""; position:absolute; top:50%; transform:translateY(-50%);
  width:4px; height:4px; border-radius:50%;
  background:radial-gradient(circle at 35% 30%, #f2dda6, #7c5c26 70%); box-shadow:0 1px 1px rgba(0,0,0,.6);}
.libplate::before{left:7px}.libplate::after{right:7px}
.libboard{position:relative; height:28px; z-index:2; border-radius:0 0 3px 3px;
  background:${BOARDTEX}, linear-gradient(180deg,#7a5530 0%, #5d3d1e 26%, #4a2f15 60%, #38220e 100%);
  box-shadow:inset 0 2px 1px rgba(255,222,168,.38), inset 0 6px 8px -5px rgba(255,200,130,.25),
    inset 0 -3px 4px rgba(0,0,0,.55), 0 6px 10px -3px rgba(0,0,0,.8);}
.libboard::after{content:""; position:absolute; left:2px; right:2px; top:100%; height:12px;
  background:linear-gradient(180deg, rgba(0,0,0,.5), transparent); pointer-events:none;}
.libwall.target .libboard{box-shadow:inset 0 2px 1px rgba(255,222,168,.38), inset 0 -3px 4px rgba(0,0,0,.55),
  0 0 0 1px #3b82f6, 0 0 18px rgba(59,130,246,.5);}
.librow{position:relative; z-index:1; display:flex; align-items:flex-end; gap:14px;
  overflow-x:auto; overflow-y:hidden; min-height:210px; padding:46px 18px 0;
  scrollbar-width:thin; scrollbar-color:#3d3325 transparent;}
.librow::-webkit-scrollbar{height:6px}
.librow::-webkit-scrollbar-thumb{background:#3d3325; border-radius:3px}
.libitem{flex:none; width:96px; outline:none; cursor:grab; -webkit-touch-callout:none;
  -webkit-user-select:none; user-select:none; touch-action:pan-x pan-y;}
.libposter{position:relative; width:96px; height:144px; border-radius:3px 3px 1px 1px; overflow:hidden;
  background:#241d15; display:flex; align-items:center; justify-content:center;
  box-shadow:inset 0 0 0 1px rgba(255,240,210,.09), 0 12px 10px -7px rgba(0,0,0,.85), 0 3px 4px rgba(0,0,0,.5);
  transition:transform .12s;}
.libposter img{width:100%; height:100%; object-fit:cover; display:block; pointer-events:none;}
.libposter .sheen{position:absolute; inset:0; pointer-events:none;
  background:linear-gradient(115deg, rgba(255,235,200,.13) 0%, rgba(255,255,255,.04) 28%, transparent 46%, rgba(0,0,0,.14) 78%, rgba(0,0,0,.28) 100%);}
.libitem:hover .libposter{transform:translateY(-3px)}
.libitem:focus-visible .libposter{box-shadow:0 0 0 2px #3b82f6, 0 6px 14px rgba(0,0,0,.45)}
.libitem.ph{cursor:default}
.libitem.ph .phbox{width:96px; height:144px; border:1px dashed #3b82f6; border-radius:5px; background:rgba(59,130,246,.08);}
.libcap{height:15px; display:flex; align-items:flex-end; justify-content:center;
  font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:.08em; color:rgba(236,211,158,.68);}
.libghost{position:fixed; z-index:100; pointer-events:none; width:96px; height:144px; border-radius:5px; overflow:hidden;
  transform:rotate(3deg) scale(1.06); box-shadow:0 24px 46px rgba(0,0,0,.8);}
.libghost img{width:100%; height:100%; object-fit:cover;}
.libtools{position:absolute; top:9px; right:8px; z-index:5; display:flex; align-items:center; gap:3px;}
`;

function LibraryPage() {
  const { statuses, ready: statusReady } = useUserStatus();
  const { shelves, ready: shelvesReady, update } = useShelves();
  const [mounted, setMounted] = useState(false);
  const [late, setLate] = useState(false);
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
    try {
      setLate(window.localStorage.getItem("balasaur:library:light") === "late");
    } catch {
      /* ignore */
    }
  }, []);
  const toggleLight = (v: boolean) => {
    setLate(v);
    try {
      window.localStorage.setItem("balasaur:library:light", v ? "late" : "evening");
    } catch {
      /* ignore */
    }
  };

  // The pool: everything the person has seen or saved, from the snapshots the
  // status store already keeps, so the room renders without a catalog query.
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
      });
    }
    return out;
  }, [statuses]);

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
  const empty = statusReady && pool.size === 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <style>{ROOM_CSS}</style>
      <div className={"libroom" + (late ? " late" : "")}>
        <div className="vig" aria-hidden="true" />
        <main id="main" className="relative z-10 mx-auto w-full max-w-[1080px] px-4 py-7 sm:px-5">
          <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[26px] font-bold tracking-tight text-[#f7f2e7]">My Library</h1>
              <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[#bdb29c]">
                {shelves.length} {shelves.length === 1 ? "shelf" : "shelves"} · {totalShelved}{" "}
                shelved · {unshelved.length} unshelved
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/lists"
                className="font-mono text-[11px] uppercase tracking-wider text-[#8d8472] underline-offset-2 hover:text-[#f7f2e7] hover:underline"
              >
                Buckets view
              </Link>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8d8472]">
                Lights
              </span>
              <button
                type="button"
                onClick={() => toggleLight(false)}
                className={`cursor-pointer rounded-[4px] border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${!late ? "border-[#8a6a30] bg-[#241b10] text-[#d3aa5e]" : "border-[#3d3325] text-[#bdb29c] hover:text-[#f7f2e7]"}`}
              >
                Evening
              </button>
              <button
                type="button"
                onClick={() => toggleLight(true)}
                className={`cursor-pointer rounded-[4px] border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${late ? "border-[#8a6a30] bg-[#241b10] text-[#d3aa5e]" : "border-[#3d3325] text-[#bdb29c] hover:text-[#f7f2e7]"}`}
              >
                Late
              </button>
            </div>
          </header>

          {!mounted || !statusReady || !shelvesReady ? (
            <div className="h-64 animate-pulse rounded-[8px] border border-[#2e261c] bg-[#1b1712]" />
          ) : empty ? (
            <div className="rounded-[8px] border border-[#2e261c] bg-[#1b1712] p-10 text-center">
              <p className="mx-auto max-w-md text-[14px] leading-relaxed text-[#bdb29c]">
                The room is empty until it knows what you have watched. Mark a few titles seen, or
                save some for later, and they arrive here ready to shelve.
              </p>
              <div className="mt-5 flex justify-center gap-3">
                <Link
                  to="/watched"
                  className="rounded-[5px] bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Rate titles
                </Link>
                <Link
                  to="/"
                  className="rounded-[5px] border border-[#3d3325] px-4 py-2 text-[13px] font-medium text-[#e2dccf] hover:border-primary"
                >
                  Browse the catalog
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="libcase">
                {shelves.map((sh, idx) => (
                  <section key={sh.id} className="relative">
                    <h2 className="sr-only">{sh.name}</h2>
                    <div className="libwall">
                      <div className="libbay">
                        <div className="liblamp" />
                        <div className="libplate" aria-hidden="true">
                          {sh.name}
                        </div>
                        <div className="libtools">
                          <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[#e4d8c0]/60">
                            {sh.items.length} {sh.items.length === 1 ? "title" : "titles"}
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
                            <div className="m-auto self-center px-2 text-[13px] text-[#8d8472]">
                              Drag a poster here.
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="libboard" />
                    </div>
                  </section>
                ))}
              </div>

              <div className="mt-4">
                {!naming ? (
                  <button
                    type="button"
                    onClick={() => setNaming(true)}
                    className="cursor-pointer rounded-[5px] border border-[#3d3325] bg-[#221c15] px-3 py-2 text-[13px] font-medium text-[#e2dccf] hover:border-primary hover:text-[#f7f2e7]"
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
                      className="w-[230px] max-w-[60vw] rounded-[5px] border border-[#3d3325] bg-[#120e09] px-3 py-2 text-[14px] text-[#f7f2e7] placeholder:text-[#8d8472] focus:border-primary focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!newName.trim()}
                      className="cursor-pointer rounded-[5px] border border-[#3d3325] bg-[#221c15] px-3 py-2 text-[13px] font-medium text-[#e2dccf] hover:border-primary disabled:opacity-40"
                    >
                      Create
                    </button>
                    <button
                      type="button"
                      onClick={() => setNaming(false)}
                      className="cursor-pointer px-2 py-2 text-[13px] text-[#8d8472] hover:text-[#bdb29c]"
                    >
                      Cancel
                    </button>
                  </form>
                )}
              </div>

              {unshelved.length > 0 && (
                <section className="mt-9">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#8d8472]">
                      Unshelved ·{" "}
                      {q ? `${unshelvedShown.length} of ${unshelved.length}` : unshelved.length}
                    </span>
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Find a title"
                      aria-label="Find an unshelved title"
                      className="ml-auto w-[190px] rounded-[5px] border border-[#3d3325] bg-[#1b1712] px-3 py-1.5 text-[13px] text-[#f7f2e7] placeholder:text-[#8d8472] focus:border-primary focus:outline-none"
                    />
                  </div>
                  <p className="mb-2 mt-1 text-[12.5px] text-[#8d8472]">
                    Everything you have seen or saved that is not on a shelf yet.
                  </p>
                  <div className="libwall border-b-2 border-dashed border-[#3d3325] pb-2">
                    <div
                      className="librow"
                      data-container="unshelved"
                      style={{ minHeight: 170, paddingTop: 8 }}
                    >
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
                        <div className="m-auto self-center text-[13px] text-[#8d8472]">
                          No unshelved title matches.
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
          <p className="mt-10 font-mono text-[10px] uppercase tracking-[0.1em] text-[#8d8472]">
            Title data from TMDB and OMDb
          </p>
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
      className="flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-[4px] border border-transparent bg-[#140e09]/60 text-[12px] leading-none text-[#e4d8c0]/70 hover:border-[#3d3325] hover:text-[#f7f2e7] disabled:cursor-default disabled:opacity-25"
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
          ? ", unshelved"
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
      <div className="libposter">
        {item.posterUrl ? (
          <img src={tmdbImage(item.posterUrl, "w185")} alt="" loading="lazy" draggable={false} />
        ) : (
          <span className="px-2 text-center text-[11px] font-bold uppercase leading-tight text-[#e2dccf]">
            {item.title}
          </span>
        )}
        <span className="sheen" />
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
              className="absolute left-[3px] top-[5px] z-[2] hidden h-6 w-[22px] cursor-pointer items-center justify-center rounded-[5px] border border-[#3d3325] bg-[#140e09]/90 text-[13px] leading-none text-[#e2dccf] hover:border-primary group-hover:flex"
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
              className="absolute right-[3px] top-[5px] z-[2] hidden h-6 w-[22px] cursor-pointer items-center justify-center rounded-[5px] border border-[#3d3325] bg-[#140e09]/90 text-[13px] leading-none text-[#e2dccf] hover:border-primary group-hover:flex"
            >
              ›
            </button>
          </>
        )}
      </div>
      <div className="libcap">{container === "unshelved" ? "" : String(pos).padStart(2, "0")}</div>
    </div>
  );
}

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
    "cursor-pointer rounded-[5px] border border-[#3d3325] bg-[#221c15] px-3 py-2 text-left text-[13px] text-[#e2dccf] hover:border-primary hover:text-[#f7f2e7] disabled:cursor-default disabled:opacity-40";

  return (
    <div
      className="fixed inset-0 z-50"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-x-3 bottom-3 mx-auto max-w-[340px] rounded-[6px] border border-[#3d3325] bg-[#1b1712] p-3.5 shadow-[0_14px_34px_rgba(0,0,0,.7)] sm:inset-x-auto sm:right-6 sm:top-24 sm:bottom-auto sm:w-[300px]">
        <div className="flex items-start gap-2">
          <p className="flex-1 text-[15px] font-semibold leading-tight text-[#f7f2e7]">
            {it.title}
          </p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="h-6 w-6 cursor-pointer rounded-[5px] font-mono text-[13px] text-[#8d8472] hover:text-[#f7f2e7]"
          >
            ×
          </button>
        </div>
        <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.06em] text-[#bdb29c]">
          {it.mediaType === "tv" ? "TV · " : ""}
          {it.year}
        </p>

        {state.qp && qpShelf && pivot ? (
          <div className="mt-3">
            <p className="text-center text-[14px] text-[#e2dccf]">
              On <b className="text-[#f7f2e7]">{qpShelf.name}</b>, above or below this one?
            </p>
            <div className="mx-auto my-2.5 flex h-[74px] w-[120px] items-center justify-center overflow-hidden rounded-[5px] border border-[#3d3325] bg-[#241d15]">
              {pivot.posterUrl ? (
                <img
                  src={tmdbImage(pivot.posterUrl, "w185")}
                  alt=""
                  className="h-full w-full object-cover object-top"
                />
              ) : (
                <span className="px-2 text-center text-[11px] font-bold uppercase text-[#e2dccf]">
                  {pivot.title}
                </span>
              )}
            </div>
            <p className="mb-2 text-center text-[12px] text-[#8d8472]">{pivot.title}</p>
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
              className="mt-2 w-full cursor-pointer py-1 text-center text-[12px] text-[#8d8472] hover:text-[#bdb29c]"
            >
              Just add it to the end
            </button>
          </div>
        ) : (
          <>
            {shelf && idx >= 0 && (
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-[#8d8472]">
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
                    className={btn + " text-[#e08aa4]"}
                    onClick={() => onRemove(shelf.id, state.id)}
                  >
                    Take off this shelf
                  </button>
                </>
              )}
              {targets.length > 0 && (
                <>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8d8472]">
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
                          className={btn + " font-mono text-[11px]"}
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
                className="mt-1 text-center font-mono text-[11px] uppercase tracking-wider text-primary hover:text-primary/80"
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
