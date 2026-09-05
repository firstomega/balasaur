// MatchBoard: N text prompts (taglines, quotes) paired against N title cards
// (posters). One layout at every width: the five posters in a row of equal
// columns, the prompts as full-width rows beneath, both sharing the board's
// edges. Tap to pair, in either order: arm one side, tap the other. Nothing
// is removed from the board while a round runs, so a landed pair never
// reflows the rows around it; the poster flies from its slot down to sit
// beside its prompt, the pair glows in the game hue, a green check stamps
// in, and the poster it left stays in its slot as a 25% ghost. Three states,
// three colors that never collide with the game hue: matched is the hue
// border plus a rating-green check, a wrong tap flashes in --warn and shakes.
// Controlled: the parent
// owns the matched list and judges every attempt via onPair; the board knows
// nothing about scoring, combos, or where rounds come from.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { tmdbImage } from "@/lib/tmdbImage";
import { cn } from "@/lib/utils";

export interface MatchPrompt {
  id: string;
  text: string;
}

export interface MatchTitleCard {
  id: string;
  title: string;
  year?: string | null;
  posterUrl?: string | null;
}

export interface MatchPair {
  promptId: string;
  titleId: string;
}

interface MatchBoardProps {
  prompts: MatchPrompt[];
  titles: MatchTitleCard[];
  /** Locked pairs, in the order they were made. Owned by the parent. */
  matched: MatchPair[];
  disabled?: boolean;
  /** Judge one attempt. Return true for a correct pair (the parent then adds
   *  it to `matched`); on false the board shakes the two tapped cards and
   *  arms nothing. Combo bookkeeping is the parent's job. */
  onPair: (promptId: string, titleId: string) => boolean;
}

type Armed = { kind: "prompt" | "title"; id: string } | null;

/** How long the poster takes to fly to its prompt. */
const FLIGHT_MS = 450;
/** When the flying pair settles into its matched row. */
const LAND_MS = 600;
/** How long the shake and warn flash stay on a wrong pair. */
const SHAKE_MS = 450;

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function MatchBoard({
  prompts,
  titles,
  matched,
  disabled = false,
  onPair,
}: MatchBoardProps) {
  const [armed, setArmed] = useState<Armed>(null);
  // Keyed by kind so a wrong pair only ever shakes the two cards that were
  // tapped: "prompt:<id>" and "title:<id>". A bare id would also hit the
  // prompt's own poster and the poster's own prompt, which gives the answer
  // away.
  const [shaking, setShaking] = useState<Set<string>>(new Set());
  // Prompt ids whose pair has finished flying and now renders as a matched
  // row. A pair in `matched` but not here is mid-flight.
  const [landed, setLanded] = useState<Set<string>>(() => new Set(matched.map((m) => m.promptId)));
  // The pair that just landed, for the glow and the stamp.
  const [fresh, setFresh] = useState<string | null>(null);
  const [live, setLive] = useState("");

  const titleRefs = useRef(new Map<string, HTMLButtonElement>());
  const slotRefs = useRef(new Map<string, HTMLElement>());
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const landTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const freshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flightRef = useRef<Animation | null>(null);

  const titleById = new Map(titles.map((t) => [t.id, t]));
  const pairByPrompt = new Map(matched.map((m) => [m.promptId, m]));
  const pairByTitle = new Map(matched.map((m) => [m.titleId, m]));

  // A new pair in `matched`: fly its poster from the strip to the slot
  // beside its prompt, then settle it into a matched row.
  const flying = matched.find((m) => !landed.has(m.promptId)) ?? null;
  useLayoutEffect(() => {
    if (!flying) return;
    const { promptId, titleId } = flying;
    const src = titleRefs.current.get(titleId);
    const dst = slotRefs.current.get(promptId);
    const settle = () => {
      setLanded((prev) => new Set(prev).add(promptId));
      setFresh(promptId);
      if (freshTimer.current) clearTimeout(freshTimer.current);
      freshTimer.current = setTimeout(() => setFresh(null), 900);
    };
    if (!src || !dst || reducedMotion() || typeof src.animate !== "function") {
      settle();
      return;
    }
    const a = src.getBoundingClientRect();
    const b = dst.getBoundingClientRect();
    const dx = b.left - a.left;
    const dy = b.top - a.top;
    const sx = b.width / a.width;
    const sy = b.height / a.height;
    src.style.transformOrigin = "top left";
    src.style.zIndex = "20";
    flightRef.current = src.animate(
      [
        { transform: "translate(0, 0) scale(1)" },
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
      ],
      { duration: FLIGHT_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "forwards" },
    );
    landTimer.current = setTimeout(settle, LAND_MS);
    return () => {
      if (landTimer.current) clearTimeout(landTimer.current);
    };
  }, [flying?.promptId, flying?.titleId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once the pair has settled the poster button is hidden, so the flight
  // animation can be dropped and the button returned to its slot unseen.
  useEffect(() => {
    if (flying) return;
    const a = flightRef.current;
    if (!a) return;
    flightRef.current = null;
    const el = a.effect instanceof KeyframeEffect ? (a.effect.target as HTMLElement | null) : null;
    a.cancel();
    if (el) {
      el.style.transformOrigin = "";
      el.style.zIndex = "";
    }
  }, [flying]);

  // A board that starts over (matched shrinks) forgets its landed rows.
  useEffect(() => {
    if (matched.length === 0 && landed.size > 0) {
      setLanded(new Set());
      setFresh(null);
    }
  }, [matched.length, landed.size]);

  useEffect(
    () => () => {
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
      if (landTimer.current) clearTimeout(landTimer.current);
      if (freshTimer.current) clearTimeout(freshTimer.current);
      flightRef.current?.cancel();
    },
    [],
  );

  const commit = (promptId: string, titleId: string) => {
    if (disabled) return;
    const ok = onPair(promptId, titleId);
    setArmed(null);
    if (ok) {
      const t = titleById.get(titleId);
      setLive(`Matched. ${t ? titleLabel(t) : ""}`.trim());
    } else {
      setLive("Not a match.");
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
      setShaking(new Set([`prompt:${promptId}`, `title:${titleId}`]));
      shakeTimer.current = setTimeout(() => setShaking(new Set()), SHAKE_MS);
    }
  };

  const tap = (kind: "prompt" | "title", id: string) => {
    if (disabled) return;
    if (armed && armed.kind !== kind) {
      commit(kind === "prompt" ? id : armed.id, kind === "title" ? id : armed.id);
      return;
    }
    setArmed(armed?.id === id ? null : { kind, id });
  };

  const titleLabel = (t: MatchTitleCard) => (t.year ? `${t.title} (${t.year})` : t.title);
  const isLanded = (promptId: string) => landed.has(promptId);

  return (
    <div className="mx-auto w-full max-w-[800px]">
      <p aria-live="polite" className="sr-only">
        {live}
      </p>

      {/* Posters: one row of equal columns at every width. A spent slot keeps
          its place so the row never shifts: the poster stays put as a 25%
          ghost, which reads as done, not missing. */}
      <div role="group" aria-label="Titles" className="grid grid-cols-5 gap-1.5 sm:gap-3">
        {titles.map((t) => {
          const pair = pairByTitle.get(t.id);
          const spent = pair !== undefined && isLanded(pair.promptId);
          const inFlight = pair !== undefined && !spent;
          const isArmed = armed?.kind === "title" && armed.id === t.id;
          const shake = shaking.has(`title:${t.id}`);
          return (
            <div key={t.id} className="min-w-0">
              <div className="relative aspect-[2/3] w-full">
                <button
                  ref={(el) => {
                    if (el) titleRefs.current.set(t.id, el);
                    else titleRefs.current.delete(t.id);
                  }}
                  type="button"
                  disabled={disabled || pair !== undefined}
                  aria-pressed={isArmed}
                  aria-label={titleLabel(t)}
                  onClick={() => tap("title", t.id)}
                  className={cn(
                    "absolute inset-0 overflow-hidden rounded-[6px] border bg-panel transition-[transform,box-shadow,border-color] duration-200 motion-reduce:transition-none motion-reduce:transform-none",
                    spent && "pointer-events-none opacity-25",
                    inFlight && "pointer-events-none border-[var(--game)]",
                    !pair && !disabled && "hover:-translate-y-0.5",
                    isArmed
                      ? "-translate-y-1 border-[var(--game)] [box-shadow:0_0_0_2px_var(--game),0_10px_28px_color-mix(in_oklab,var(--game)_45%,transparent)]"
                      : "border-border",
                    shake && "arcade-shake border-warn",
                    disabled && !pair && "opacity-50",
                  )}
                >
                  {t.posterUrl ? (
                    <img
                      src={tmdbImage(t.posterUrl, "w342")}
                      alt=""
                      draggable={false}
                      className="pointer-events-none h-full w-full select-none object-cover"
                    />
                  ) : (
                    <span
                      className="flex h-full w-full items-center justify-center px-1 text-center text-[11px] font-black leading-tight tracking-[-0.02em] text-text-bright sm:text-[14px]"
                      style={{
                        background:
                          "linear-gradient(160deg, color-mix(in oklab, var(--game) 45%, #0b0d10), color-mix(in oklab, var(--game) 18%, #0b0d10))",
                      }}
                    >
                      {t.title}
                    </span>
                  )}
                  {shake && <span aria-hidden="true" className="absolute inset-0 bg-warn/40" />}
                </button>
              </div>
              <p
                className={cn(
                  "mt-1 truncate text-center text-[10.5px] leading-tight text-text-muted sm:text-[12.5px]",
                  spent && "text-text-dim",
                )}
                aria-hidden="true"
              >
                {t.title}
              </p>
            </div>
          );
        })}
      </div>

      {/* Prompts: full-width rows. A matched row keeps its place and shows
          its poster beside the text at the same width, never truncated. */}
      <div role="group" aria-label="Prompts" className="mt-4 flex flex-col gap-2 sm:mt-5">
        {prompts.map((p) => {
          const pair = pairByPrompt.get(p.id);
          const done = pair !== undefined && isLanded(p.id);
          const inFlight = pair !== undefined && !done;
          const title = pair ? titleById.get(pair.titleId) : undefined;
          const isArmed = armed?.kind === "prompt" && armed.id === p.id;
          const shake = shaking.has(`prompt:${p.id}`);
          const glow = fresh === p.id;
          return (
            <div
              key={p.id}
              className={cn(
                "relative flex items-stretch gap-3 rounded-[6px] border transition-[box-shadow,border-color,background-color] duration-300",
                done
                  ? "border-[var(--game)] [background:color-mix(in_oklab,var(--game)_14%,var(--color-panel))]"
                  : inFlight
                    ? "border-[var(--game)] bg-panel"
                    : "border-transparent",
                glow &&
                  "[box-shadow:0_0_0_1px_var(--game),0_0_24px_color-mix(in_oklab,var(--game)_40%,transparent)]",
              )}
            >
              {/* The poster slot beside a matched prompt. It exists only for
                  pairs, so open rows stay text-only, and it is the flight
                  target while the poster is still on its way. */}
              {pair && (
                <span
                  ref={(el) => {
                    if (el) slotRefs.current.set(p.id, el);
                    else slotRefs.current.delete(p.id);
                  }}
                  className="my-2 ml-2 block w-[40px] shrink-0 overflow-hidden rounded-[4px] sm:w-[48px]"
                  style={{ aspectRatio: "2 / 3" }}
                  aria-hidden="true"
                >
                  {done && title?.posterUrl ? (
                    <img
                      src={tmdbImage(title.posterUrl, "w154")}
                      alt=""
                      draggable={false}
                      className="h-full w-full object-cover"
                    />
                  ) : done ? (
                    <span
                      className="block h-full w-full"
                      style={{
                        background:
                          "linear-gradient(160deg, color-mix(in oklab, var(--game) 45%, #0b0d10), color-mix(in oklab, var(--game) 18%, #0b0d10))",
                      }}
                    />
                  ) : null}
                </span>
              )}

              {done && title ? (
                <div className="flex min-w-0 flex-1 items-center gap-3 py-2 pr-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] leading-snug text-text-bright sm:text-[15px]">
                      {p.text}
                    </span>
                    <span className="mt-0.5 block font-mono text-[11px] text-[var(--game)]">
                      {titleLabel(title)}
                    </span>
                  </span>
                  <span
                    key={glow ? "fresh" : "set"}
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rating text-background",
                      glow && "arcade-stamp",
                    )}
                  >
                    <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                    <span className="sr-only">Matched</span>
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={disabled || pair !== undefined}
                  aria-pressed={isArmed}
                  onClick={() => tap("prompt", p.id)}
                  className={cn(
                    "relative min-h-[52px] min-w-0 flex-1 rounded-[5px] border px-3.5 py-3 text-left text-[14px] leading-snug transition-[transform,background-color,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:transform-none sm:text-[15px]",
                    isArmed
                      ? "border-[var(--game)] bg-[var(--game)] font-semibold text-[var(--game-ink)] [box-shadow:0_8px_24px_color-mix(in_oklab,var(--game)_40%,transparent)]"
                      : inFlight
                        ? "border-transparent bg-transparent text-text-bright"
                        : "border-border bg-panel text-text hover:border-[var(--game)]",
                    shake && "arcade-shake border-warn bg-warn/15 text-warn",
                    disabled && !pair && "opacity-50",
                  )}
                >
                  {p.text}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
