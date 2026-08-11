import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Search } from "lucide-react";
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

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) skip();
        else onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-panel text-foreground sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="font-mono text-[13px] uppercase tracking-wider text-text-bright">
            Pick {TARGET} things you loved
          </DialogTitle>
          <DialogDescription className="font-mono text-[10.5px] uppercase tracking-wider text-text-dim">
            Seeds your favorites so Balasaur learns your taste — search for anything
          </DialogDescription>
        </DialogHeader>

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

        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {shown.map((c) => {
            const active = picked.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c)}
                aria-pressed={active}
                title={`${c.title}${c.year ? ` (${c.year})` : ""}`}
                className={
                  "relative aspect-[2/3] overflow-hidden rounded-[5px] border transition-all " +
                  (active
                    ? "border-rating ring-2 ring-rating/60"
                    : "border-border opacity-90 hover:border-border-strong hover:opacity-100")
                }
              >
                <img
                  src={tmdbImage(c.posterUrl, "w185")}
                  alt={c.title}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
                {active && (
                  <span className="absolute right-1 top-1 rounded-full bg-rating p-0.5 text-black">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={skip}
            className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-text-dim hover:text-text-muted"
          >
            Skip for now
          </button>
          <button
            type="button"
            disabled={picked.size === 0}
            onClick={finish}
            className="cursor-pointer rounded-[5px] bg-primary px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {picked.size >= TARGET
              ? `Save ${picked.size} favorites`
              : `Save${picked.size > 0 ? ` (${picked.size}/${TARGET})` : ""}`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
