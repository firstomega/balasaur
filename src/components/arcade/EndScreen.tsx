import { useEffect, useState } from "react";
import { Check, Image as ImageIcon, Share2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AnimatedCount } from "@/components/balasaur/AnimatedCount";
import { MediaCard } from "@/components/balasaur/MediaCard";
import { ScoreBadge } from "@/components/balasaur/ScoreBadge";
import { ScrollRail } from "@/components/balasaur/ScrollRail";
import { ENABLED_SLUGS, GAMES } from "@/lib/arcade/games";
import type { GameDef, PayoutLine } from "@/lib/arcade/types";
import { shareCard, type ShareCardOutcome } from "@/lib/arcade/shareImage";
import type { MediaItem } from "@/types/media";
import { mediaSlug } from "@/lib/slug";
import { tmdbImage, tmdbSrcSet } from "@/lib/tmdbImage";
import { cn } from "@/lib/utils";
import { ArcadeTile } from "./ArcadeTile";
import { ArcadeMotion } from "./arcadeMotion";
import { CometBurst } from "./CometBurst";
import { CometMark } from "./CometChip";
import { LeaderboardSnippet, type SnippetRow } from "./LeaderboardSnippet";
import { NextCountdown } from "./NextCountdown";
import { ResultGrid, gridCells } from "./ResultGrid";
import { StatsBlock, type Distribution, type StatsNumbers } from "./StatsBlock";

// The shared end-of-run panel, sequenced on a 400ms beat: the tier word in
// the hue, the headline, the comet total counting up with the mark (the
// arithmetic stays, as one small line beneath), the result grid as colored
// squares, the record, the share row, the live countdown, the answers, and
// more games. A losing run gets no ledger: the headline says what happened
// and one line says what would have paid. Reduced motion skips the delays,
// never the content.

/** What a game route passes GameShell for the ended phase. The payout
 *  (earned, breakdown) comes from the engine, not from here. */
export interface EndScreenContent {
  /** Earned word in the hue: "Perfect ten", "Clean board", "Par", "Close". */
  tier?: string;
  /** The result as a claim, e.g. "8 of 10 right". */
  headline: string;
  /** Emoji rows from share.ts, drawn as colored squares. */
  grid?: string[];
  /** The per-game record from stats.ts (GameStats) after recordResult;
   *  typed by shape so any record with these four numbers renders. */
  stats?: StatsNumbers;
  /** Guess-count games: past results per bucket, today's highlighted. */
  distribution?: Distribution;
  shareText: string;
  /** When set, a Save image button draws the 1080x1350 card. */
  shareImage?: { title: string; subtitle: string };
  /** The round's answers, rendered as cards linking to detail pages. */
  answers?: MediaItem[];
  answersLabel?: string;
  /** One-answer games: the line under the title, e.g. the clue that
   *  cracked it ("Clue 4: Won 4 Oscars."). */
  answerNote?: string;
  leaderboard?: { rows: SnippetRow[]; you?: SnippetRow | null; label?: string };
  /** A run that paid nothing. No ledger; lostHint says what would have. */
  lost?: boolean;
  /** e.g. "A right call pays 2 comets." */
  lostHint?: string;
  /** The player's first comets ever: one extra line says what they are for. */
  firstComets?: boolean;
  /** Routes that render their own More games block pass false. */
  moreGames?: boolean;
}

/** Split the share grid into its squares and the count it could not fit.
 *  Speed Sort's row ends " +11" past ten squares; on screen that number must
 *  not sit beside the comet numeral, so it becomes its own line below.
 *  Pure, tested. */
export function splitGrid(rows: string[]): { squares: string[]; overflow: string | null } {
  const squares: string[] = [];
  let overflow: string | null = null;
  for (const row of rows) {
    let kept = "";
    for (const cell of gridCells(row)) {
      if (cell.kind === "square") {
        kept += { green: "🟩", red: "🟥", black: "⬛", yellow: "🟨" }[cell.tone];
      } else {
        const m = cell.text.match(/^\+(\d+)$/);
        overflow = m ? `+${m[1]} more` : cell.text;
      }
    }
    squares.push(kept);
  }
  return { squares, overflow };
}

/** The arithmetic as one line: "4 matches x 2, clean board +5". */
export function ledgerLine(breakdown: PayoutLine[]): string {
  return breakdown
    .filter((l) => l.value !== 0 || (l.count !== undefined && l.count > 0))
    .map((l) => {
      const label = l.label.toLowerCase();
      if (l.count !== undefined && l.per !== undefined) return `${l.count} ${label} x ${l.per}`;
      return `${label} ${l.value >= 0 ? "+" : ""}${l.value}`;
    })
    .join(", ");
}

const BEAT_MS = 400;
// Reveal order. Each block waits for its step; a block with nothing to show
// simply skips, the beat still passes so the rhythm holds.
const STEP = {
  tier: 0,
  headline: 1,
  comets: 2, // the numeral mounts at 0
  count: 3, // and counts up to the total
  burst: 4, // then the glyphs fly to the chip
  grid: 4,
  stats: 5,
  share: 6,
  next: 7,
  answers: 8,
  more: 9,
  board: 10,
} as const;
const LAST_STEP = 10;

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

const ENTER = "animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300";

export function EndScreen({
  game,
  dayNumber,
  earned,
  breakdown,
  tier,
  headline,
  grid,
  stats,
  distribution,
  shareText,
  shareImage,
  answers,
  answersLabel = "The answers",
  answerNote,
  leaderboard,
  lost = false,
  lostHint,
  firstComets = false,
  moreGames = true,
}: EndScreenContent & {
  game: GameDef;
  dayNumber?: number;
  earned: number;
  breakdown: PayoutLine[];
}) {
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const [fallbackText, setFallbackText] = useState(false);
  const [imageState, setImageState] = useState<ShareCardOutcome | "drawing" | null>(null);

  useEffect(() => {
    if (reducedMotion()) {
      setStep(LAST_STEP);
      return;
    }
    const id = setInterval(() => {
      setStep((s) => {
        if (s >= LAST_STEP) {
          clearInterval(id);
          return s;
        }
        return s + 1;
      });
    }, BEAT_MS);
    return () => clearInterval(id);
  }, []);

  const showComets = !lost && earned > 0;
  const shown = (s: number) => step >= s;

  const share = async () => {
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ text: shareText });
        return;
      }
    } catch (e) {
      // AbortError is the user closing the sheet; anything else falls through
      if ((e as { name?: string })?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFallbackText(true);
    }
  };

  const saveImage = async () => {
    if (!shareImage) return;
    setImageState("drawing");
    const outcome = await shareCard({
      slug: game.slug,
      day: dayNumber,
      title: shareImage.title,
      subtitle: shareImage.subtitle,
      grid,
    });
    setImageState(outcome);
    setTimeout(() => setImageState(null), 3000);
  };

  const others = ENABLED_SLUGS.filter((s) => s !== game.slug);
  const gridParts = splitGrid(grid ?? []);

  return (
    <div className="mt-6">
      <ArcadeMotion />

      {tier && shown(STEP.tier) && (
        <p
          className={cn(
            ENTER,
            "text-[13px] font-black uppercase leading-none tracking-[0.12em] text-[var(--game,var(--primary))]",
          )}
        >
          {tier}
        </p>
      )}

      {shown(STEP.headline) && (
        <div className={ENTER}>
          <h2 className="mt-1 text-[28px] font-black leading-[1.05] tracking-[-0.02em] text-text-bright sm:text-[34px]">
            {headline}
          </h2>
          {lost && lostHint && (
            <p className="mt-2 text-[14px] leading-relaxed text-text-muted">{lostHint}</p>
          )}
        </div>
      )}

      {showComets && shown(STEP.comets) && (
        <div className={cn(ENTER, "mt-4")}>
          <div className="relative inline-flex items-center gap-2">
            <CometMark className="h-8 w-8 text-[var(--game,var(--primary))]" />
            <span className="text-[40px] font-black leading-none tabular-nums tracking-[-0.02em] text-text-bright">
              +<AnimatedCount value={shown(STEP.count) ? earned : 0} />
            </span>
            <CometBurst count={earned} fire={shown(STEP.burst)} />
          </div>
          <p className="mt-1 font-mono text-[11.5px] tabular-nums text-text-dim">
            {ledgerLine(breakdown)}
          </p>
          {firstComets && (
            <p className="mt-2 text-[13.5px] text-text-muted">
              Your first comets. They count on the weekly board.
            </p>
          )}
        </div>
      )}

      {grid && grid.length > 0 && shown(STEP.grid) && (
        <div className={cn(ENTER, "mt-5")}>
          <ResultGrid rows={gridParts.squares} />
          {gridParts.overflow && (
            <p className="mt-1.5 font-mono text-[11.5px] tabular-nums text-text-dim">
              {gridParts.overflow}
            </p>
          )}
        </div>
      )}

      {stats && shown(STEP.stats) && (
        <StatsBlock
          stats={stats}
          distribution={distribution}
          className={cn(ENTER, "mt-6 border-t border-border pt-5")}
        />
      )}

      {shown(STEP.share) && (
        <div className={cn(ENTER, "mt-6 flex flex-wrap items-center gap-2")}>
          <button
            type="button"
            onClick={share}
            className="arcade-focus inline-flex items-center gap-2 rounded-full bg-[var(--game,var(--primary))] px-5 py-2.5 text-[14px] font-black tracking-[-0.01em] text-[var(--game-ink,var(--primary-foreground))] hover:brightness-110"
          >
            {copied ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Share2 className="h-4 w-4" aria-hidden="true" />
            )}
            {copied ? "Copied" : "Share"}
          </button>
          {shareImage && (
            <button
              type="button"
              onClick={saveImage}
              disabled={imageState === "drawing"}
              className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-background px-4 py-2.5 text-[14px] font-semibold text-text-bright hover:border-[var(--game,var(--primary))] hover:text-[var(--game,var(--primary))] disabled:opacity-60"
            >
              <ImageIcon className="h-4 w-4" aria-hidden="true" />
              {imageState === "shared"
                ? "Shared"
                : imageState === "opened"
                  ? "Opened"
                  : "Save image"}
            </button>
          )}
          {imageState === "blocked" && (
            <span className="text-[12.5px] text-text-muted">Allow pop-ups to open the image.</span>
          )}
          {imageState === "failed" && (
            <span className="text-[12.5px] text-text-muted">The image did not draw.</span>
          )}
          {fallbackText && (
            <textarea
              readOnly
              value={shareText}
              rows={3}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Share text"
              className="mt-2 w-full rounded-[5px] border border-border bg-background p-2 font-mono text-[12px] text-text"
            />
          )}
        </div>
      )}

      {shown(STEP.next) && (
        <div className={cn(ENTER, "mt-3 font-mono text-[12px] tabular-nums text-text-muted")}>
          <NextCountdown />
        </div>
      )}

      {answers && answers.length > 0 && shown(STEP.answers) && (
        <div className={cn(ENTER, "mt-6 border-t border-border pt-4")}>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-text-dim">
            {answersLabel}
          </p>
          {answers.length === 1 ? (
            <AnswerRow item={answers[0]} note={answerNote} />
          ) : (
            <div className="relative">
              <ScrollRail className="gap-2.5">
                {answers.map((item) => (
                  <div key={item.id} className="w-[calc((100%-44px)/2)] shrink-0 sm:w-[132px]">
                    <MediaCard item={item} imgSizes="(min-width: 640px) 132px, 45vw" />
                  </div>
                ))}
              </ScrollRail>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent sm:hidden"
              />
            </div>
          )}
        </div>
      )}

      {moreGames && others.length > 0 && shown(STEP.more) && (
        <div className={cn(ENTER, "mt-6 border-t border-border pt-4")}>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-text-dim">
            More games
          </p>
          <ScrollRail className="gap-2.5">
            {others.map((slug) => (
              <ArcadeTile key={slug} game={GAMES[slug]} className="w-[168px] shrink-0" />
            ))}
          </ScrollRail>
        </div>
      )}

      {leaderboard && (leaderboard.rows.length > 0 || leaderboard.you) && shown(STEP.board) && (
        <div className={cn(ENTER, "mt-6 border-t border-border pt-4")}>
          <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-text-dim">
            {leaderboard.label ?? "Today's board"}
          </p>
          <LeaderboardSnippet rows={leaderboard.rows} you={leaderboard.you} />
        </div>
      )}
    </div>
  );
}

// A one-answer game (Balasaurdle, Poster Reveal, Emoji Plots) shows the
// title as one row: the poster at 200px, then the name, the year, the
// Balasaur Score and the route's note (the clue that cracked it) centered
// on the poster's height beside it. A lone 130px card left the rest of the
// column empty; a row uses the width the column already has.
function AnswerRow({ item, note }: { item: MediaItem; note?: string }) {
  const rawId = item.id.replace(/^(movie|tv)-/, "");
  const linkable = (item.mediaType === "movie" || item.mediaType === "tv") && /^\d+$/.test(rawId);
  const slug = mediaSlug(rawId, item.title);
  const score = item.ratings?.balasaur;
  const art = (
    <div className="aspect-[2/3] w-full overflow-hidden rounded-[5px] border border-border bg-panel">
      {item.posterUrl ? (
        <img
          src={tmdbImage(item.posterUrl, "w342")}
          srcSet={tmdbSrcSet(item.posterUrl, [
            { w: 185, size: "w185" },
            { w: 342, size: "w342" },
            { w: 500, size: "w500" },
          ])}
          sizes="200px"
          alt=""
          width={342}
          height={513}
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-accent text-text-dim">
          <span className="font-mono text-[11px] uppercase">No art</span>
        </div>
      )}
    </div>
  );
  const name = (
    <span className="text-[22px] font-black leading-[1.1] tracking-[-0.02em] text-text-bright sm:text-[26px]">
      {item.title}
    </span>
  );
  return (
    <div className="flex items-center gap-4 sm:gap-5">
      <div className="w-[150px] shrink-0 sm:w-[200px]">
        {linkable ? (
          <Link
            to={item.mediaType === "movie" ? "/movie/$id" : "/tv/$id"}
            params={{ id: slug }}
            className="block"
            aria-label={item.title}
          >
            {art}
          </Link>
        ) : (
          art
        )}
      </div>
      <div className="min-w-0">
        {linkable ? (
          <Link
            to={item.mediaType === "movie" ? "/movie/$id" : "/tv/$id"}
            params={{ id: slug }}
            className="hover:underline"
          >
            {name}
          </Link>
        ) : (
          name
        )}
        <p className="mt-1.5 font-mono text-[12px] tabular-nums text-text-muted">{item.year}</p>
        {typeof score === "number" && (
          <div className="mt-3">
            <ScoreBadge score={score} size="md" />
          </div>
        )}
        {note && <p className="mt-3 text-[14px] leading-snug text-text-muted">{note}</p>}
      </div>
    </div>
  );
}
