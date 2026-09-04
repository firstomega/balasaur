import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { searchTitles, type SearchHit } from "@/lib/catalog.functions";

// The title-guess combobox, extracted verbatim from Balasaurdle (the
// GuessInput in the old src/routes/play.tsx) so every guessing game shares
// one input: debounced catalog search, six hits, keyboard nav. The only
// addition is the optional placeholder, which also labels the field.

export function GuessBox({
  onGuess,
  disabled,
  placeholder = "Guess a movie or show",
}: {
  onGuess: (hit: SearchHit) => void;
  disabled: boolean;
  placeholder?: string;
}) {
  const search = useServerFn(searchTitles);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = q.trim();
    if (!t) {
      setHits([]);
      return;
    }
    let dead = false;
    const timer = setTimeout(async () => {
      try {
        const r = await search({ data: { query: t } });
        if (!dead) {
          setHits(r.slice(0, 6));
          setActive(0);
        }
      } catch {
        if (!dead) setHits([]);
      }
    }, 180);
    return () => {
      dead = true;
      clearTimeout(timer);
    };
  }, [q, search]);

  function pick(hit: SearchHit) {
    setQ("");
    setHits([]);
    onGuess(hit);
  }

  return (
    <div ref={boxRef} className="relative">
      <label className="relative block">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dim"
          aria-hidden="true"
        />
        <input
          type="search"
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls="guess-listbox"
          aria-autocomplete="list"
          aria-activedescendant={hits.length > 0 ? `guess-opt-${active}` : undefined}
          value={q}
          disabled={disabled}
          onChange={(e) => setQ(e.target.value)}
          onBlur={() => setTimeout(() => setHits([]), 150)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setHits([]);
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && hits[active]) {
              e.preventDefault();
              pick(hits[active]);
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-10 w-full rounded-[5px] border border-border bg-panel pl-8 pr-3 font-mono text-[13px] text-foreground placeholder:text-text-dim focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
        />
      </label>
      {hits.length > 0 && (
        <ul
          id="guess-listbox"
          role="listbox"
          aria-label="Matches"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-[5px] border border-border bg-panel shadow-lg"
        >
          {hits.map((h, i) => (
            <li key={h.id} id={`guess-opt-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(h)}
                className={
                  "flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-[13px] " +
                  (i === active ? "bg-background text-text-bright" : "text-text")
                }
              >
                <span className="truncate">{h.title}</span>
                <span className="shrink-0 font-mono text-[12px] text-text-dim">
                  {h.year || h.mediaType}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
