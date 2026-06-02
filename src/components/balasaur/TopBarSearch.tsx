import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { searchTitles, type SearchHit } from "@/lib/catalog.functions";
import { mediaSlug } from "@/lib/slug";

const TYPE_COLOR: Record<string, string> = {
  movie: "text-media-movie",
  tv: "text-media-tv",
  book: "text-media-book",
  podcast: "text-media-podcast",
};

export function TopBarSearch() {
  const navigate = useNavigate();
  const search = useServerFn(searchTitles);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // Debounced server-side title search — the header no longer loads the whole
  // catalog into the browser just to search it.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const hits = await search({ data: { query: q } });
        if (!cancelled) setResults(hits);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, search]);

  useEffect(() => {
    setActive(0);
  }, [results]);

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
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(hit: SearchHit) {
    if (hit.mediaType !== "movie" && hit.mediaType !== "tv") return;
    const rawId = hit.id.replace(/^(movie|tv)-/, "");
    setOpen(false);
    setQuery("");
    navigate({
      to: hit.mediaType === "movie" ? "/movie/$id" : "/tv/$id",
      params: { id: mediaSlug(rawId, hit.title) },
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
      const hit = results[active];
      if (hit) go(hit);
    }
  }

  const showDropdown = open && query.trim().length > 0;

  return (
    <div ref={wrapRef} className="relative w-full">
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
          placeholder="Search titles…"
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
              {results.map((hit, i) => {
                const isActive = i === active;
                return (
                  <li
                    key={hit.id}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      go(hit);
                    }}
                    className={
                      "flex cursor-pointer items-center gap-3 px-2 py-1.5 " +
                      (isActive ? "bg-background" : "")
                    }
                  >
                    <div className="h-12 w-8 shrink-0 overflow-hidden rounded-[3px] border border-border bg-background">
                      {hit.posterUrl ? (
                        <img
                          src={hit.posterUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-[12.5px] font-semibold text-text-bright">
                          {hit.title}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-text-dim">
                          {hit.year || "—"}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px]">
                        <span
                          className={`uppercase tracking-wider ${TYPE_COLOR[hit.mediaType] ?? "text-text-muted"}`}
                        >
                          {hit.mediaType}
                        </span>
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
