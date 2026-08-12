import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useHomeRails } from "@/hooks/useCatalog";
import { searchTitles } from "@/lib/catalog.functions";
import { recordForSentiment } from "@/lib/userStatus";
import { tmdbImage } from "@/lib/tmdbImage";
import type { RecordStatusFn } from "@/hooks/useUserStatus";
import type { MediaItem, MediaType } from "@/types/media";

// First-visit taste ramp: "pick a few things you loved" over a grid of
// recognizable titles (the geo-scoped rails double as the candidate pool) plus a
// search box for everything else. Each pick files as watched+liked — the same
// record the deck's swipe-up writes — so five taps seed Favorites/History and
// every "because you liked" surface downstream. Shown once per device
// (localStorage flag), always skippable, and the natural moment to prompt
// account creation right after (picks migrate on sign-in automatically).

const TARGET = 5;
const KEY = "balasaur:tasteRamp";

export function tasteRampSeen(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return true; // storage unavailable → never auto-open
  }
}

export function markTasteRampSeen(): void {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // non-fatal
  }
}

interface Candidate {
  id: string;
  mediaType: string;
  title: string;
  year: string;
  posterUrl: string;
}

function toCandidate(item: MediaItem): Candidate {
  return {
    id: item.id,
    mediaType: item.mediaType,
    title: item.title,
    year: item.year,
    posterUrl: item.posterUrl,
  };
}

function candidateToItem(c: Candidate): MediaItem {
  return {
    id: c.id,
    mediaType: c.mediaType as MediaType,
    title: c.title,
    year: c.year,
    overview: "",
    posterUrl: c.posterUrl,
    ratings: {},
    genres: [],
    streaming: [],
    lengthLabel: "",
    people: [],
  };
}

export function TasteRamp({
  open,
  onOpenChange,
  boostCountry,
  recordStatus,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  boostCountry?: string;
  recordStatus: RecordStatusFn;
  /** Called with the number of picks after Save — the parent decides what's next
   *  (toast, auth prompt for anonymous visitors). */
  onComplete: (picked: number) => void;
}) {
  const { data: rails } = useHomeRails(boostCountry);
  const search = useServerFn(searchTitles);
  const [picked, setPicked] = useState<Map<string, Candidate>>(new Map());
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Candidate[]>([]);

  // Candidate pool: trending + noteworthy + gems, deduped, posters only.
  const pool = useMemo(() => {
    const seen = new Set<string>();
    const out: Candidate[] = [];
    for (const list of [rails?.trending, rails?.newAndNoteworthy, rails?.hiddenGems]) {
      for (const item of list ?? []) {
        if (!item.posterUrl || seen.has(item.id)) continue;
        seen.add(item.id);
        out.push(toCandidate(item));
      }
    }
    return out.slice(0, 24);
  }, [rails]);

  // Debounced title search so any favorite is reachable, not just what's hot.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await search({ data: { query: q } });
        if (!cancelled)
          setHits(
            res
              .filter((h) => h.posterUrl)
              .slice(0, 8)
              .map((h) => ({
                id: h.id,
                mediaType: h.mediaType,
                title: h.title,
                year: h.year ?? "",
                posterUrl: h.posterUrl ?? "",
              })),
          );
      } catch {
        if (!cancelled) setHits([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, search]);

  const toggle = (c: Candidate) => {
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(c.id)) next.delete(c.id);
      else next.set(c.id, c);
      return next;
    });
  };

  const finish = () => {
    for (const c of picked.values()) {
      recordStatus(c.id, recordForSentiment(undefined, "liked"), candidateToItem(c));
    }
    markTasteRampSeen();
    onOpenChange(false);
    onComplete(picked.size);
  };

  const skip = () => {
    markTasteRampSeen();
    onOpenChange(false);
  };

  const shown = hits.length > 0 ? hits : pool;
  const remaining = Math.max(0, TARGET - picked.size);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) skip();
        else onOpenChange(v);
      }}
    >
      <DialogContent className="flex max-h-[88vh] flex-col border-border bg-panel text-foreground sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle className="font-mono text-[13px] uppercase tracking-wider text-text-bright">
            Pick {TARGET} things you loved
          </DialogTitle>
          <DialogDescription className="font-mono text-[10.5px] uppercase tracking-wider text-text-dim">
            Seeds your favorites so Balasaur learns your taste — search for anything
          </DialogDescription>
        </DialogHeader>

        {/* Your picks tray: every selection lands here immediately (visible
            progress), removable with one tap. Slots show how far to go. */}
        <div className="flex items-center gap-2 overflow-x-auto rounded-[5px] border border-border bg-background/60 p-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[...picked.values()].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c)}
              title={`Remove ${c.title}`}
              aria-label={`Remove ${c.title}`}
              className="group/pick relative h-[72px] w-[48px] shrink-0 overflow-hidden rounded-[4px] border border-rating"
            >
              <img
                src={tmdbImage(c.posterUrl, "w92")}
                alt=""
                className="h-full w-full object-cover"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover/pick:opacity-100">
                <X className="h-4 w-4 text-white" />
              </span>
            </button>
          ))}
          {Array.from({ length: remaining }, (_, i) => (
            <span
              key={`slot-${i}`}
              aria-hidden="true"
              className="flex h-[72px] w-[48px] shrink-0 items-center justify-center rounded-[4px] border border-dashed border-border font-mono text-[13px] text-text-dim"
            >
              {picked.size + i + 1}
            </span>
          ))}
          <span className="ml-1 shrink-0 font-mono text-[10px] uppercase tracking-wider text-text-dim">
            {picked.size >= TARGET
              ? `${picked.size} picked — nice taste`
              : `${picked.size} of ${TARGET}`}
          </span>
        </div>

        <label className="relative block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dim" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search any title…"
            className="h-9 w-full rounded-[5px] border border-border bg-background pl-8 pr-2 font-mono text-[12px] text-foreground placeholder:text-text-dim focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </label>

        {/* Big, LABELED cells — recognizing a title needs its name, not just a
            thumbnail. Scrolls inside the dialog; the tray + footer stay put. */}
        <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {shown.map((c) => {
              const active = picked.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c)}
                  aria-pressed={active}
                  className="group/cell cursor-pointer text-left"
                >
                  <span
                    className={
                      "relative block aspect-[2/3] overflow-hidden rounded-[5px] border transition-all " +
                      (active
                        ? "border-rating ring-2 ring-rating/60"
                        : "border-border group-hover/cell:border-border-strong")
                    }
                  >
                    <img
                      src={tmdbImage(c.posterUrl, "w342")}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                    {active && (
                      <span className="absolute right-1.5 top-1.5 rounded-full bg-rating p-1 text-black">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </span>
                  <span className="mt-1 line-clamp-1 block text-[11.5px] font-semibold leading-tight text-text-bright">
                    {c.title}
                  </span>
                  <span className="block font-mono text-[9.5px] text-text-muted">
                    {c.year || "—"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={skip}
            className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-text-dim hover:text-text-muted"
          >
            Skip for now
          </button>
          <button
            type="button"
            disabled={picked.size < TARGET}
            onClick={finish}
            className="cursor-pointer rounded-[5px] bg-primary px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {picked.size >= TARGET ? `Save ${picked.size} favorites` : `Pick ${remaining} more`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
