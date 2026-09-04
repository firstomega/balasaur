// ChainBoard: Link Up's stepper. Start and target actors are pinned top and
// bottom; the player alternates picking a movie, then an actor from that
// movie, out of server-provided choice sets, and every committed hop renders
// as a link row on a vertical rail. A wrong hop is marked as a dead end and
// can only be stepped back from. Controlled: the parent owns the chain, the
// current choices, and the verdicts; the board only renders and reports taps.

import { Check } from "lucide-react";
import { tmdbImage } from "@/lib/tmdbImage";

export interface ChainStep {
  kind: "movie" | "actor";
  id: string;
  label: string;
  /** Year for a movie step, the part played for an actor step. */
  sub?: string | null;
  posterUrl?: string | null;
}

export interface ChainChoice {
  id: string;
  label: string;
  sub?: string | null;
  posterUrl?: string | null;
}

interface ChainBoardProps {
  /** Start actor's name. */
  start: string;
  /** Target actor's name. */
  target: string;
  par: number;
  /** Committed hops, oldest first. Owned by the parent. */
  chain: ChainStep[];
  /** What the current choice set contains. */
  choosing: "movie" | "actor";
  choices: ChainChoice[];
  /** The last hop leads nowhere; only stepping back remains. */
  deadEnd?: boolean;
  /** The chain reached the target; the board locks and states the count. */
  complete?: boolean;
  disabled?: boolean;
  onChoose: (id: string) => void;
  onStepBack: () => void;
}

function Rail() {
  return <span aria-hidden="true" className="ml-[18px] block h-3 w-px bg-border" />;
}

export function ChainBoard({
  start,
  target,
  par,
  chain,
  choosing,
  choices,
  deadEnd = false,
  complete = false,
  disabled = false,
  onChoose,
  onStepBack,
}: ChainBoardProps) {
  const open = !disabled && !complete && !deadEnd;
  const lastActor = [...chain].reverse().find((s) => s.kind === "actor")?.label ?? start;
  const lastMovie = [...chain].reverse().find((s) => s.kind === "movie")?.label ?? "";
  const movieCount = chain.filter((s) => s.kind === "movie").length;

  const personChip = (name: string, tone: string) => (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[5px] border px-3 py-1.5 text-[14px] font-semibold ${tone}`}
    >
      {name}
    </span>
  );

  return (
    <div>
      <p className="text-[15px] text-text">
        Get from <span className="font-semibold text-text-bright">{start}</span> to{" "}
        <span className="font-semibold text-text-bright">{target}</span>.{" "}
        <span className="font-mono text-[12px] text-text-dim">Par {par}.</span>
      </p>

      <div className="mt-4" aria-label="Your chain">
        <div>
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-dim">
            Start
          </span>
          {personChip(start, "border-border bg-panel text-text-bright")}
        </div>

        {chain.map((step, i) => {
          const isDead = deadEnd && i === chain.length - 1;
          return (
            <div key={`${step.kind}-${step.id}-${i}`}>
              <Rail />
              {step.kind === "movie" ? (
                <div
                  className={`flex items-center gap-2.5 rounded-[5px] border px-2.5 py-1.5 ${
                    isDead ? "border-orange-400/60 bg-orange-400/10" : "border-border bg-panel"
                  }`}
                >
                  {step.posterUrl ? (
                    <img
                      src={tmdbImage(step.posterUrl, "w154")}
                      alt=""
                      draggable={false}
                      className="h-[48px] w-[32px] shrink-0 rounded-[3px] object-cover"
                    />
                  ) : (
                    <span className="h-[48px] w-[32px] shrink-0 rounded-[3px] border border-border" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-text">{step.label}</span>
                    {step.sub && (
                      <span className="block font-mono text-[11px] text-text-dim">{step.sub}</span>
                    )}
                  </span>
                  {isDead && (
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-orange-300">
                      Dead end
                    </span>
                  )}
                </div>
              ) : (
                <div>
                  {personChip(
                    step.label,
                    isDead
                      ? "border-orange-400/60 bg-orange-400/10 text-orange-300"
                      : "border-border bg-panel text-text-bright",
                  )}
                  {isDead && (
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-orange-300">
                      Dead end
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {open && (
          <div>
            <Rail />
            <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-text-dim">
              {choosing === "movie" ? `A movie with ${lastActor}` : `An actor in ${lastMovie}`}
            </p>
            {choosing === "movie" ? (
              <div role="group" aria-label="Movie choices" className="flex flex-col gap-2">
                {choices.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onChoose(c.id)}
                    className="flex min-h-[44px] items-center gap-2.5 rounded-[5px] border border-border bg-panel px-2.5 py-1.5 text-left hover:border-primary"
                  >
                    {c.posterUrl ? (
                      <img
                        src={tmdbImage(c.posterUrl, "w154")}
                        alt=""
                        draggable={false}
                        className="h-[48px] w-[32px] shrink-0 rounded-[3px] object-cover"
                      />
                    ) : (
                      <span className="h-[48px] w-[32px] shrink-0 rounded-[3px] border border-border" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-text">{c.label}</span>
                      {c.sub && (
                        <span className="block font-mono text-[11px] text-text-dim">{c.sub}</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div role="group" aria-label="Actor choices" className="grid grid-cols-2 gap-2">
                {choices.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onChoose(c.id)}
                    className="min-h-[44px] rounded-[5px] border border-border bg-panel px-3 py-2 text-left hover:border-primary"
                  >
                    <span className="block text-[14px] font-semibold leading-snug text-text-bright">
                      {c.label}
                    </span>
                    {c.sub && (
                      <span className="mt-0.5 block font-mono text-[10.5px] text-text-dim">
                        {c.sub}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {chain.length > 0 && !complete && (
          <button
            type="button"
            disabled={disabled}
            onClick={onStepBack}
            className={`mt-3 rounded-[4px] font-mono text-[11px] uppercase tracking-wider disabled:opacity-50 ${
              deadEnd
                ? "border border-border bg-panel px-3 py-2 text-text hover:border-primary"
                : "text-text-dim hover:text-text"
            }`}
          >
            Step back
          </button>
        )}

        <span
          aria-hidden="true"
          className={`ml-[18px] block h-4 border-l border-dashed ${
            complete ? "border-emerald-400/60" : "border-border"
          }`}
        />
        <div>
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-dim">
            Target
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-[5px] border px-3 py-1.5 text-[14px] font-semibold ${
              complete
                ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-300"
                : "border-border bg-panel text-text-bright"
            }`}
          >
            {target}
            {complete && <Check className="h-4 w-4" aria-hidden="true" />}
          </span>
        </div>

        {complete && (
          <p className="mt-3 font-mono text-[12.5px] text-text">
            Done in {movieCount} movie{movieCount === 1 ? "" : "s"}. Par {par}.
          </p>
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {complete
          ? `Chain complete. Done in ${movieCount} movies. Par ${par}.`
          : deadEnd
            ? "Dead end. Step back to try another path."
            : ""}
      </p>
    </div>
  );
}
