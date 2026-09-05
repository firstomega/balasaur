import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { searchTitles, type SearchHit } from "@/lib/catalog.functions";
import { cn } from "@/lib/utils";

// The title-guess combobox every guessing game shares: debounced catalog
// search, six hits, keyboard nav. It paints its focus ring in the game hue
// (var(--game), set by GameShell) and shakes on a miss: the route bumps the
// `shake` counter after a wrong guess and the box shudders once, flashes its
// border red, and takes focus back so the next guess can be typed at once.
// Reduced motion: the shake is off (styles.css), the red flash still shows.

export function GuessBox({
  onGuess,
  disabled,
  placeholder = "Guess a movie or show",
  shake = 0,
  autoFocus = false,
}: {
  onGuess: (hit: SearchHit) => void;
  disabled: boolean;
  placeholder?: string;
  /** A counter. Every increment plays one shake. 0 never shakes. */
  shake?: number;
  autoFocus?: boolean;
}) {
  const search = useServerFn(searchTitles);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [missed, setMissed] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shakeSeen = useRef(shake);

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

  // A miss: restart the shake by removing the class, forcing a reflow, and
  // adding it back, so two misses in a row both shudder. Focus returns to
  // the field so the next guess needs no tap.
  useEffect(() => {
    if (shake === shakeSeen.current) return;
    shakeSeen.current = shake;
    if (shake <= 0) return;
    const el = boxRef.current;
    if (el) {
      el.classList.remove("arcade-shake");
      void el.offsetWidth;
      el.classList.add("arcade-shake");
    }
    setMissed(true);
    const t = setTimeout(() => {
      setMissed(false);
      el?.classList.remove("arcade-shake");
    }, 450);
    if (!disabled) inputRef.current?.focus();
    return () => clearTimeout(t);
  }, [shake, disabled]);

  function pick(hit: SearchHit) {
    setQ("");
    setHits([]);
    onGuess(hit);
  }

  return (
    <div ref={boxRef} className="relative">
      <label className="relative block">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls="guess-listbox"
          aria-autocomplete="list"
          aria-activedescendant={hits.length > 0 ? `guess-opt-${active}` : undefined}
          value={q}
          disabled={disabled}
          autoFocus={autoFocus}
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
          className={cn(
            "h-12 w-full rounded-[6px] border bg-panel pl-10 pr-3 text-[15px] text-text-bright placeholder:text-text-dim focus:outline-none disabled:opacity-50",
            "focus:border-[var(--game,var(--primary))] focus:ring-2 focus:ring-[color-mix(in_oklab,var(--game,var(--primary))_35%,transparent)]",
            missed ? "border-destructive" : "border-border-strong",
          )}
        />
      </label>
      {hits.length > 0 && (
        <ul
          id="guess-listbox"
          role="listbox"
          aria-label="Matches"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-[6px] border border-border bg-panel shadow-lg"
        >
          {hits.map((h, i) => (
            <li key={h.id} id={`guess-opt-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(h)}
                className={cn(
                  "flex w-full items-baseline justify-between gap-3 px-3 py-2.5 text-left text-[14px]",
                  i === active
                    ? "bg-[color-mix(in_oklab,var(--game,var(--primary))_18%,var(--color-panel))] text-text-bright"
                    : "text-text",
                )}
              >
                <span className="truncate">{h.title}</span>
                <span className="shrink-0 font-mono text-[12px] tabular-nums text-text-dim">
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
