import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useMediaItems } from "@/hooks/useMediaItems";
import type { MediaItem } from "@/types/media";

interface ResultRow {
  item: MediaItem;
  matchedPerson?: { name: string; role: string };
  score: number;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function scoreMatch(haystack: string, q: string): number {
  if (!haystack) return 0;
  const h = normalize(haystack);
  if (h === q) return 100;
  if (h.startsWith(q)) return 80;
  const idx = h.indexOf(q);
  if (idx >= 0) return 60 - Math.min(idx, 30);
  // light fuzzy: all chars of q appear in order
  let i = 0;
  for (const c of h) {
    if (c === q[i]) i++;
    if (i === q.length) return 20;
  }
  return 0;
}

function searchCatalog(items: MediaItem[], query: string, limit = 8): ResultRow[] {
  const q = normalize(query.trim());
  if (!q) return [];
  const out: ResultRow[] = [];
  for (const item of items) {
    const titleScore = scoreMatch(item.title, q);
    let bestPerson: { name: string; role: string } | undefined;
    let personScore = 0;
    for (const p of item.people) {
      const s = scoreMatch(p.name, q);
      if (s > personScore) {
        personScore = s;
        bestPerson = { name: p.name, role: p.role };
      }
    }
    const score = Math.max(titleScore, personScore * 0.7);
    if (score <= 0) continue;
    out.push({
      item,
      matchedPerson: titleScore >= personScore ? undefined : bestPerson,
      score: score + (item.popularity ?? 0) / 10000,
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

const TYPE_COLOR: Record<string, string> = {
  movie: "text-media-movie",
  tv: "text-media-tv",
  book: "text-media-book",
  podcast: "text-media-podcast",
};

export function TopBarSearch() {
  const { data: items } = useMediaItems();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = "topbar-search-results";

  const results = useMemo(() => searchCatalog(items, query), [items, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  // Outside click closes
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Global "/" focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(row: ResultRow) {
    const { item } = row;
    if (item.mediaType !== "movie" && item.mediaType !== "tv") return;
    const rawId = item.id.replace(/^(movie|tv)-/, "");
    setOpen(false);
    setQuery("");
    navigate({
      to: item.mediaType === "movie" ? "/movie/$id" : "/tv/$id",
      params: { id: rawId },
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = results[active];
      if (row) go(row);
    }
  }

  const showDropdown = open && query.trim().length > 0;

  return (
    <div ref={wrapRef} className="relative mx-auto hidden w-full max-w-md md:block">
      <label className="relative block">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dim"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listId}
          aria-autocomplete="list"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search titles, people, genres…"
          className="h-8 w-full rounded-[5px] border border-border bg-panel pl-8 pr-8 font-mono text-[12px] text-foreground placeholder:text-text-dim focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-bright"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </label>

      {showDropdown && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-40 max-h-[70vh] overflow-y-auto rounded-[5px] border border-border bg-panel shadow-[0_12px_32px_-12px_rgba(0,0,0,0.8)]"
        >
          {results.length === 0 ? (
            <div className="px-3 py-4 font-mono text-[11px] uppercase tracking-wider text-text-dim">
              No matches
            </div>
          ) : (
            <ul className="py-1">
              {results.map((row, i) => {
                const { item, matchedPerson } = row;
                const isActive = i === active;
                const rawId = item.id.replace(/^(movie|tv)-/, "");
                const isLinkable = item.mediaType === "movie" || item.mediaType === "tv";
                return (
                  <li
                    key={item.id}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (isLinkable) go(row);
                    }}
                    className={
                      "flex cursor-pointer items-center gap-3 px-2 py-1.5 " +
                      (isActive ? "bg-background" : "")
                    }
                  >
                    <div className="h-12 w-8 shrink-0 overflow-hidden rounded-[3px] border border-border bg-background">
                      {item.posterUrl ? (
                        <img
                          src={item.posterUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-[12.5px] font-semibold text-text-bright">
                          {item.title}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-text-dim">
                          {item.year || "—"}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px]">
                        <span
                          className={`uppercase tracking-wider ${TYPE_COLOR[item.mediaType] ?? "text-text-muted"}`}
                        >
                          {item.mediaType}
                        </span>
                        {matchedPerson && (
                          <span className="truncate text-text-muted">
                            · with {matchedPerson.name}
                            {matchedPerson.role ? ` (${matchedPerson.role})` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-border px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-text-dim">
            ↑↓ navigate · ↵ open · esc close
          </div>
        </div>
      )}
    </div>
  );
}