import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { MediaCard } from "@/components/balasaur/MediaCard";
import { ScrollRail } from "@/components/balasaur/ScrollRail";
import type { MediaItem } from "@/types/media";
import type { PayoutLine } from "@/lib/arcade/types";
import { CometBurst } from "./CometBurst";
import { LeaderboardSnippet, type SnippetRow } from "./LeaderboardSnippet";

// The shared end-of-run panel. Headline claim, the comet payout with its
// arithmetic visible line by line, share and play-again, then the round's
// answers as cards linking to their detail pages, and the day board when the
// game has one. GameShell renders it in the "ended" phase; the game route
// supplies everything but the payout, which comes from the engine.

/** What a game route passes GameShell for the ended phase. The payout
 *  (earned, breakdown) comes from the engine, not from here. */
export interface EndScreenContent {
  /** The result as a claim, e.g. "8 of 10 in order". */
  headline: string;
  /** When set, a Share result button copies this to the clipboard. */
  shareText?: string;
  /** Replayable games pass a reset handler. */
  onPlayAgain?: () => void;
  /** Daily games pass a line instead, e.g. "Next game at midnight UTC." */
  nextGameLine?: string;
  /** The round's answers, rendered as cards linking to detail pages. */
  answers?: MediaItem[];
  answersLabel?: string;
  leaderboard?: {
    rows: SnippetRow[];
    you?: SnippetRow | null;
    label?: string;
  };
}

/** One payout line's arithmetic, e.g. "4 x 2 = 8" or "+5". */
function lineMath(line: PayoutLine): string {
  if (line.count !== undefined && line.per !== undefined) {
    return `${line.count} x ${line.per} = ${line.value}`;
  }
  return line.value >= 0 ? `+${line.value}` : `${line.value}`;
}

export function EndScreen({
  earned,
  breakdown,
  headline,
  shareText,
  onPlayAgain,
  nextGameLine,
  answers,
  answersLabel = "The answers",
  leaderboard,
}: EndScreenContent & { earned: number; breakdown: PayoutLine[] }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    if (!shareText) return;
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the button simply does nothing visible */
    }
  };

  return (
    <div className="mt-6 rounded-[6px] border border-border bg-panel p-4">
      <p className="text-[18px] font-bold leading-tight text-text-bright">{headline}</p>

      {breakdown.length > 0 && (
        <div className="relative mt-3 space-y-1 border-t border-border pt-3">
          {breakdown.map((line, i) => (
            <div
              key={i}
              className="flex items-baseline justify-between gap-3 font-mono text-[12.5px]"
            >
              <span className="text-text-muted">{line.label}</span>
              <span className="tabular-nums text-text">{lineMath(line)}</span>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 pt-1 font-mono text-[12.5px] font-semibold text-text-bright">
            <span>Comets</span>
            <span className="tabular-nums">
              = {earned} comet{earned === 1 ? "" : "s"}
            </span>
          </div>
          {earned > 0 && <CometBurst count={earned} />}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {onPlayAgain && !nextGameLine && (
          <button
            type="button"
            onClick={onPlayAgain}
            className="inline-flex items-center rounded-[5px] bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
          >
            Play again
          </button>
        )}
        {shareText && (
          <button
            type="button"
            onClick={share}
            className={
              // Balasaurdle's primary share button when it stands alone;
              // quiet next to a Play again button so one action leads.
              onPlayAgain && !nextGameLine
                ? "inline-flex items-center gap-1.5 rounded-[5px] border border-border bg-background px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-text hover:border-primary hover:text-primary"
                : "inline-flex items-center gap-1.5 rounded-[5px] bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
            }
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {copied ? "Copied" : "Share result"}
          </button>
        )}
        {nextGameLine && (
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
            {nextGameLine}
          </span>
        )}
      </div>

      {answers && answers.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-text-dim">
            {answersLabel}
          </p>
          <ScrollRail className="gap-2.5">
            {answers.map((item) => (
              <div key={item.id} className="w-[132px] shrink-0">
                <MediaCard item={item} imgSizes="132px" />
              </div>
            ))}
          </ScrollRail>
        </div>
      )}

      {leaderboard && (leaderboard.rows.length > 0 || leaderboard.you) && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-text-dim">
            {leaderboard.label ?? "Today's board"}
          </p>
          <LeaderboardSnippet rows={leaderboard.rows} you={leaderboard.you} />
        </div>
      )}
    </div>
  );
}
