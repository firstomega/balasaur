// ChainBoard: Link Up's path. Start actor at the top, target at the bottom,
// and between them every committed hop as a node on one vertical line: a
// movie as a 64px poster with its title inline (no panel around it), the
// actor it hands over as a chip. The open step offers four movies as poster
// cards in four columns across the path; a wrong pick branches off the path as
// a dead end with the movie's cast under it (so the miss is a fact learned),
// stays disabled with a "Dead end" tag once stepped back from, and can never
// be picked twice. The run has one number, picks, stated once when the
// chain closes. Controlled: the parent owns the chain, the choices, the
// tried set, and the verdicts; the board renders and reports taps.

import { Check } from "lucide-react";
import { tmdbImage } from "@/lib/tmdbImage";
import { cn } from "@/lib/utils";

export interface ChainStep {
  kind: "movie" | "actor";
  id: string;
  label: string;
  /** Year for a movie step, the part played for an actor step. */
  sub?: string | null;
  posterUrl?: string | null;
  /** A dead-ended movie's cast, shown under the node so the miss teaches. */
  cast?: string[] | null;
}

export interface ChainChoice {
  id: string;
  label: string;
  sub?: string | null;
  posterUrl?: string | null;
  /** Shown once the option has dead-ended. */
  cast?: string[] | null;
}

export interface ChainBoardProps {
  /** Start actor's name. */
  start: string;
  /** Target actor's name. */
  target: string;
  par: number;
  /** Committed hops, oldest first. Owned by the parent. */
  chain: ChainStep[];
  /** The open step's four movies. */
  choices: ChainChoice[];
  /** Option ids already dead-ended at the open step: disabled, tagged. */
  tried?: string[];
  /** The last hop leads nowhere; only stepping back remains. */
  deadEnd?: boolean;
  /** The chain reached the target; the board locks. */
  complete?: boolean;
  /** Movie picks this run, right and wrong. Stated once, on completion. */
  picks?: number;
  disabled?: boolean;
  onChoose: (id: string) => void;
  onStepBack: () => void;
  /** @deprecated Ignored. The board only ever offers movies. */
  choosing?: "movie";
}

const RAIL_X = 13;
const HUE = "var(--game, var(--primary))";
const INK = "var(--game-ink, var(--primary-foreground))";

function Chip({
  name,
  tone,
  children,
}: {
  name: string;
  tone: "path" | "goal" | "done";
  children?: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[14px] font-semibold leading-snug",
        tone === "path" &&
          "border-[color-mix(in_oklab,var(--game,var(--primary))_55%,var(--color-border))] text-text-bright [background:color-mix(in_oklab,var(--game,var(--primary))_18%,var(--color-panel))]",
        tone === "goal" && "border-dashed border-border-strong bg-panel text-text-bright",
        tone === "done" && "arcade-pop border-transparent",
      )}
      style={tone === "done" ? { background: HUE, color: INK } : undefined}
    >
      {name}
      {children}
    </span>
  );
}

function Poster({ url, className }: { url?: string | null; className?: string }) {
  return url ? (
    <img
      src={tmdbImage(url, "w185")}
      alt=""
      draggable={false}
      className={cn("shrink-0 rounded-[4px] object-cover", className)}
    />
  ) : (
    <span className={cn("shrink-0 rounded-[4px] border border-border bg-panel", className)} />
  );
}

export function ChainBoard({
  start,
  target,
  par,
  chain,
  choices,
  tried = [],
  deadEnd = false,
  complete = false,
  picks,
  disabled = false,
  onChoose,
  onStepBack,
}: ChainBoardProps) {
  const open = !disabled && !complete && !deadEnd;
  const lastActor = [...chain].reverse().find((s) => s.kind === "actor")?.label ?? start;
  const triedSet = new Set(tried);

  // One node per row. The line runs down the left through every node's
  // dot; it is solid for the path walked and dashed from the open step to
  // the target until the chain closes.
  const rail = (kind: "solid" | "dashed" | "warn" | "none") =>
    kind === "none" ? null : (
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-4 bottom-0 w-0 border-l-2",
          kind === "dashed" && "border-dashed",
          kind === "warn" && "border-warn/70",
        )}
        style={{
          left: RAIL_X,
          borderColor:
            kind === "solid"
              ? HUE
              : kind === "dashed"
                ? "color-mix(in oklab, var(--game, var(--primary)) 45%, var(--color-border))"
                : undefined,
        }}
      />
    );

  const dot = (tone: "hue" | "warn" | "dim") => (
    <span
      aria-hidden="true"
      className={cn(
        "absolute top-[11px] h-[10px] w-[10px] rounded-full border-2",
        tone === "warn" && "border-warn bg-warn/30",
        tone === "dim" && "border-border-strong bg-background",
      )}
      style={
        tone === "hue"
          ? { left: RAIL_X - 4, borderColor: HUE, background: HUE }
          : { left: RAIL_X - 4 }
      }
    />
  );

  const stepBack = (tone: "warn" | "quiet") => (
    <button
      type="button"
      disabled={disabled}
      onClick={onStepBack}
      className={cn(
        "inline-flex min-h-[32px] items-center rounded-full border px-3 py-1 text-[12.5px] font-semibold disabled:opacity-50",
        tone === "warn"
          ? "border-warn text-warn hover:bg-warn/10"
          : "border-border text-text-muted hover:border-border-strong hover:text-text-bright",
      )}
    >
      Step back
    </button>
  );

  return (
    <div>
      <p className="text-[15px] leading-snug text-text">
        Get from <span className="font-semibold text-text-bright">{start}</span> to{" "}
        <span className="font-semibold text-text-bright">{target}</span>.{" "}
        <span className="font-mono text-[12px] text-text-dim">Par {par}.</span>
      </p>

      <ol className="mt-4" aria-label="Your chain">
        <li className="relative pb-5 pl-9">
          {rail(chain.length === 0 ? "dashed" : deadEnd && chain.length === 1 ? "warn" : "solid")}
          {dot("hue")}
          <Chip name={start} tone="path" />
        </li>

        {chain.map((step, i) => {
          const isLast = i === chain.length - 1;
          const isDead = deadEnd && isLast;
          const intoDead = deadEnd && i === chain.length - 2;
          const nextIsPath = !isLast || complete;
          return (
            <li key={`${step.kind}-${step.id}-${i}`} className="relative pb-5 pl-9">
              {rail(isDead ? "none" : intoDead ? "warn" : nextIsPath ? "solid" : "dashed")}
              {dot(isDead ? "warn" : "hue")}
              {step.kind === "movie" ? (
                <div
                  className={cn("flex items-center gap-3", isDead ? "arcade-shake" : "arcade-pop")}
                >
                  <Poster
                    url={step.posterUrl}
                    className={cn(
                      "h-[96px] w-[64px] ring-1",
                      isDead
                        ? "ring-warn/70 grayscale"
                        : "ring-[color-mix(in_oklab,var(--game,var(--primary))_55%,var(--color-border))]",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="block text-[16px] font-black leading-tight tracking-[-0.01em] text-text-bright">
                      {step.label}
                    </span>
                    {step.sub && (
                      <span className="mt-0.5 block font-mono text-[11px] text-text-dim">
                        {step.sub}
                      </span>
                    )}
                    {isDead && (
                      <span className="mt-1.5 block font-mono text-[10.5px] uppercase tracking-wider text-warn">
                        Dead end. Not with {lastActor}.
                      </span>
                    )}
                    {isDead && step.cast && step.cast.length > 0 && (
                      <span className="mt-1 block text-[12.5px] leading-snug text-text-muted">
                        Cast: {step.cast.join(", ")}
                      </span>
                    )}
                    {isDead && <span className="mt-2.5 block">{stepBack("warn")}</span>}
                  </div>
                </div>
              ) : (
                <Chip name={step.label} tone="path" />
              )}
            </li>
          );
        })}

        {open && (
          <li className="relative pb-5 pl-9">
            {rail("dashed")}
            {dot("dim")}
            <div className="flex min-h-[36px] flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
                A movie with {lastActor}
              </p>
              {chain.length > 0 && stepBack("quiet")}
            </div>
            {/* Four columns across the path's width at every size. The
                caption is one line, cut with an ellipsis, never split
                inside a word; the aria-label carries the full title. */}
            <div
              role="group"
              aria-label="Movie choices"
              className="mt-2 grid grid-cols-4 gap-1.5 sm:gap-2"
            >
              {choices.map((c) => {
                const dead = triedSet.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={dead}
                    aria-label={dead ? `${c.label}, dead end` : c.label}
                    onClick={() => onChoose(c.id)}
                    className={cn(
                      "group min-w-0 rounded-[6px] border p-1 text-left transition-transform sm:p-1.5",
                      dead
                        ? "cursor-not-allowed border-warn/40 bg-warn/5 opacity-70"
                        : "border-border bg-panel hover:-translate-y-0.5 hover:border-[var(--game,var(--primary))] motion-reduce:transform-none",
                    )}
                  >
                    <span className="relative block aspect-[2/3] w-full overflow-hidden rounded-[4px] bg-panel">
                      {c.posterUrl ? (
                        <img
                          src={tmdbImage(c.posterUrl, "w342")}
                          alt=""
                          draggable={false}
                          className={cn(
                            "absolute inset-0 h-full w-full object-cover",
                            dead && "grayscale",
                          )}
                        />
                      ) : (
                        <span className="absolute inset-0 border border-border" />
                      )}
                      {dead && (
                        <span className="absolute inset-x-1 top-1 rounded-[3px] bg-black/80 px-1 py-0.5 text-center font-mono text-[9.5px] uppercase tracking-wider text-warn">
                          Dead end
                        </span>
                      )}
                    </span>
                    <span className="mt-1.5 block truncate text-[12px] font-semibold leading-tight text-text-bright sm:text-[12.5px]">
                      {c.label}
                    </span>
                    {c.sub && (
                      <span className="block truncate font-mono text-[10.5px] text-text-dim">
                        {c.sub}
                      </span>
                    )}
                    {dead && c.cast && c.cast.length > 0 && (
                      <span className="mt-1 hidden line-clamp-3 text-[10.5px] leading-snug text-text-muted sm:block">
                        {c.cast.slice(0, 3).join(", ")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </li>
        )}

        <li className="relative pl-9">
          {dot(complete ? "hue" : "dim")}
          <Chip name={target} tone={complete ? "done" : "goal"}>
            {complete && <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />}
          </Chip>
        </li>
      </ol>

      {complete && picks !== undefined && (
        <p className="mt-4 text-[15px] text-text">
          <span className="font-black tracking-[-0.01em] text-text-bright">
            Done in {picks} pick{picks === 1 ? "" : "s"}
          </span>
          <span className="text-text-muted">, par {par}.</span>
        </p>
      )}

      <p aria-live="polite" className="sr-only">
        {complete
          ? picks !== undefined
            ? `Chain complete. Done in ${picks} picks, par ${par}.`
            : "Chain complete."
          : deadEnd
            ? "Dead end. Step back to try another movie."
            : ""}
      </p>
    </div>
  );
}
