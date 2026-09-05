import { useRef, type ReactNode } from "react";
import { hueVars } from "@/lib/arcade/games";
import type { GameDef } from "@/lib/arcade/types";
import type { ArcadeGameApi } from "@/lib/arcade/useArcadeGame";
import { cn } from "@/lib/utils";
import { ArcadeMotion } from "./arcadeMotion";
import { CometBurstProvider } from "./CometBurst";
import { ArcadeCometTarget, CometChip } from "./CometChip";
import { EndScreen, type EndScreenContent } from "./EndScreen";
import { GameMark } from "./GameMark";
import { ScoreStrip } from "./ScoreStrip";

// The chrome every game page shares. The root sets the game's hue, so every
// component below paints from var(--game). Header: a one-line hue band with
// the mark on a hue disc, the name in the display weight, the day chip inline,
// and the comet chip (absent until the player has any). The hook joins the
// band only on wide screens once play has started; in the ready state the
// panel below carries it large, and at phone width the band stays one line so
// the board starts within 60px of the top bar. Ready: the mark large on a hue
// block, the hook, one Play pill, the rule, and a collapsible how-to that
// exists only here. Playing: the score strip and the board; the timer lives
// in the board next to what it times. Ended: the EndScreen. Phases cross-fade.

const ENTER = "animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-200";

export function GameShell({
  game,
  api,
  end,
  dayNumber,
  comets,
  howTo,
  readyExtra,
  startLabel = "Play",
  showScoreStrip = true,
  narrow = false,
  children,
}: {
  game: GameDef;
  api: ArcadeGameApi;
  /** Everything the ended phase needs except the payout, which comes from
   *  the engine. */
  end: EndScreenContent;
  /** Today's number; the chip reads "No. 18". */
  dayNumber?: number;
  /** Pass the page's own useComets result so a credit on finish ticks the
   *  header chip; separate hook instances do not share state in-tab. */
  comets?: { total: number; ready: boolean };
  /** Three short lines, shown under a collapsible "How to play" in the
   *  ready state only. */
  howTo?: string[];
  /** Extra ready-panel content under the how-to. */
  readyExtra?: ReactNode;
  startLabel?: string;
  /** Games with no running score (Link Up) turn the strip off. */
  showScoreStrip?: boolean;
  /** Text boards (Balasaurdle, Poster Reveal, Emoji) are 600px wide at
   *  every width. Set this so the band and the end screen share that
   *  column and the page has one left edge. */
  narrow?: boolean;
  children: ReactNode;
}) {
  const cometTargetRef = useRef<HTMLElement | null>(null);
  const dayChip = dayNumber !== undefined ? `No. ${dayNumber}` : null;
  const roundChip = !game.daily && api.phase !== "ready" ? `Round ${api.round}` : null;
  const chip = dayChip ?? roundChip;
  // The ready panel already says the hook at 16px; the band repeats it only
  // once play has started, and only where a second line costs nothing.
  const bandHook = api.phase !== "ready";

  return (
    <ArcadeCometTarget.Provider value={cometTargetRef}>
      <CometBurstProvider>
        <section
          style={hueVars(game.slug)}
          className={cn("mx-auto w-full", narrow ? "max-w-[600px]" : "lg:max-w-[880px]")}
        >
          <ArcadeMotion />

          <header
            className={cn(
              "flex items-center justify-between gap-3 rounded-[6px] border px-3 py-2.5 sm:px-4",
              "border-[color-mix(in_oklab,var(--game,var(--primary))_35%,var(--color-border))] [background:color-mix(in_oklab,var(--game,var(--primary))_16%,var(--color-panel))]",
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--game,var(--primary))] [background:color-mix(in_oklab,var(--game,var(--primary))_24%,var(--color-background))]"
                aria-hidden="true"
              >
                <GameMark slug={game.slug} size={22} />
              </span>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="truncate text-[20px] font-black leading-none tracking-[-0.02em] text-text-bright sm:text-[22px]">
                    {game.name}
                  </h1>
                  {chip && (
                    <span className="shrink-0 whitespace-nowrap rounded-full border border-[color-mix(in_oklab,var(--game,var(--primary))_45%,transparent)] px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider text-[var(--game,var(--primary))]">
                      {chip}
                    </span>
                  )}
                </div>
                {bandHook && (
                  <p className="mt-1 hidden text-[13.5px] leading-snug text-text-muted sm:block">
                    {game.hook}
                  </p>
                )}
              </div>
            </div>
            <CometChip total={comets?.total} ready={comets?.ready} className="shrink-0" />
          </header>

          {api.phase === "ready" && (
            <div key="ready" className={cn(ENTER, "mt-6 flex flex-col items-center text-center")}>
              <div className="flex h-[132px] w-[132px] items-center justify-center rounded-[6px] bg-[var(--game,var(--primary))] text-[var(--game-ink,var(--primary-foreground))]">
                <GameMark slug={game.slug} size={96} />
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <h2 className="text-[28px] font-black leading-none tracking-[-0.02em] text-text-bright">
                  {game.name}
                </h2>
                {dayChip && (
                  <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
                    {dayChip}
                  </span>
                )}
              </div>
              <p className="mt-3 max-w-[34ch] text-[16px] leading-snug text-text">{game.hook}</p>
              <button
                type="button"
                onClick={api.start}
                autoFocus
                className="mt-5 inline-flex min-w-[160px] items-center justify-center rounded-full bg-[var(--game,var(--primary))] px-8 py-3 text-[16px] font-black tracking-[-0.01em] text-[var(--game-ink,var(--primary-foreground))] transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--game,var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none"
              >
                {startLabel}
              </button>
              <p className="mt-4 text-[12.5px] text-text-muted">{game.rule}</p>
              <p className="mt-1 text-[12px] text-text-dim">{game.payoutRule}</p>

              {howTo && howTo.length > 0 && (
                <details className="group/howto mt-4 w-full max-w-[44ch] text-left">
                  <summary className="cursor-pointer list-none font-mono text-[11px] uppercase tracking-wider text-text-dim hover:text-text-bright [&::-webkit-details-marker]:hidden">
                    <span className="inline-block w-3 transition-transform group-open/howto:rotate-90 motion-reduce:transition-none">
                      &#9656;
                    </span>{" "}
                    How to play
                  </summary>
                  <ol className="mt-2 space-y-1.5 border-l-2 border-[color-mix(in_oklab,var(--game,var(--primary))_50%,transparent)] pl-3 text-[13.5px] leading-snug text-text">
                    {howTo.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ol>
                </details>
              )}
              {readyExtra && <div className="mt-4 w-full text-left">{readyExtra}</div>}
            </div>
          )}

          {api.phase === "playing" && (
            <div key="playing" className={cn(ENTER, "mt-5")}>
              {showScoreStrip && <ScoreStrip score={api.score} combo={api.combo} />}
              <div className={showScoreStrip ? "mt-3" : undefined}>{children}</div>
            </div>
          )}

          {api.phase === "ended" && (
            <div key="ended" className={ENTER}>
              <EndScreen
                game={game}
                dayNumber={dayNumber}
                earned={api.comets.earned}
                breakdown={api.comets.breakdown}
                {...end}
              />
            </div>
          )}
        </section>
      </CometBurstProvider>
    </ArcadeCometTarget.Provider>
  );
}
