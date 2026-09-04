import { useRef, type ReactNode } from "react";
import type { GameDef } from "@/lib/arcade/types";
import type { ArcadeGameApi } from "@/lib/arcade/useArcadeGame";
import { ArcadeCometTarget, CometChip } from "./CometChip";
import { EndScreen, type EndScreenContent } from "./EndScreen";
import { ScoreStrip } from "./ScoreStrip";
import { TimerRing } from "./TimerRing";

// The chrome every game page shares: header with name, badge, timer, and
// comet chip; a ready panel with the payout rule and a Start button (what
// crawlers index); the board with its score strip while playing; and the
// EndScreen when the run ends. Games render exactly one of these around
// exactly one board primitive; no game owns its own timer or end screen.

export function GameShell({
  game,
  api,
  end,
  dayNumber,
  comets,
  readyExtra,
  startLabel = "Start",
  showScoreStrip = true,
  children,
}: {
  game: GameDef;
  api: ArcadeGameApi;
  /** Everything the ended phase needs except the payout, which comes from
   *  the engine. */
  end: EndScreenContent;
  /** Daily games pass today's number; the badge reads "#12". Round games
   *  get a "Round N" badge from the engine while playing. */
  dayNumber?: number;
  /** Pass the page's own useComets result so a credit on finish ticks the
   *  header chip; separate hook instances do not share state in-tab. */
  comets?: { total: number; ready: boolean };
  /** Extra ready-panel content under the payout rule, e.g. a how-to. */
  readyExtra?: ReactNode;
  startLabel?: string;
  /** Games with no running score (Link Up) turn the strip off. */
  showScoreStrip?: boolean;
  children: ReactNode;
}) {
  const cometTargetRef = useRef<HTMLElement | null>(null);

  const badge =
    game.daily && dayNumber !== undefined
      ? `#${dayNumber}`
      : !game.daily && api.phase !== "ready"
        ? `Round ${api.round}`
        : null;

  return (
    <ArcadeCometTarget.Provider value={cometTargetRef}>
      <section>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h1 className="text-[20px] font-bold tracking-tight text-text-bright">{game.name}</h1>
              {badge && (
                <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
                  {badge}
                </span>
              )}
            </div>
            <p className="mt-1 text-[13.5px] text-text-muted">{game.tagline}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            <TimerRing timer={api.timer} />
            <CometChip total={comets?.total} ready={comets?.ready} />
          </div>
        </div>

        {api.phase === "ready" && (
          <div className="mt-6 rounded-[6px] border border-border bg-panel p-4">
            <p className="text-[13.5px] leading-relaxed text-text">{game.payoutRule}</p>
            {readyExtra}
            <button
              type="button"
              onClick={api.start}
              className="mt-4 w-full rounded-[5px] bg-primary px-3 py-2.5 font-mono text-[12px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
            >
              {startLabel}
            </button>
          </div>
        )}

        {api.phase === "playing" && (
          <div className="mt-5">
            {showScoreStrip && <ScoreStrip score={api.score} combo={api.combo} />}
            <div className={showScoreStrip ? "mt-3" : undefined}>{children}</div>
          </div>
        )}

        {api.phase === "ended" && (
          <EndScreen earned={api.comets.earned} breakdown={api.comets.breakdown} {...end} />
        )}
      </section>
    </ArcadeCometTarget.Provider>
  );
}
