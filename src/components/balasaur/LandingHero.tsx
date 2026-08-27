import { useState } from "react";
import { DinoMark } from "./DinoMark";
import { AuthDialog } from "./AuthDialog";

interface Props {
  onBrowse: () => void;
}

export function LandingHero({ onBrowse }: Props) {
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <section
      aria-label="Welcome to Balasaur"
      className="mb-5 overflow-hidden rounded-[6px] border border-border bg-panel"
    >
      <div className="relative px-4 py-5 sm:px-6 sm:py-6">
        {/* faint grid texture */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <DinoMark className="h-6 w-6 text-primary" />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
                Balasaur · v0
              </span>
            </div>
            {/* The most-read line on the site, so it names the one thing no
                competitor has. "Your personal entertainment database" was
                equally true of Letterboxd and Trakt, and it left the number on
                every poster unexplained for a first-time visitor from search.
                No catalog count here on purpose: the grid below reports 76,351
                rows while only 66,422 carry a score, so any figure in the hero
                would contradict the count a reader can see. */}
            <h1 className="text-[22px] font-semibold leading-tight text-text-bright sm:text-[26px]">
              One number instead of four rating sites.
            </h1>
            {/* No universal claim here. "Any two titles can be compared" was
                false for the 9,929 catalogued titles that carry no score, and
                naming four sources implies four per title when 14 of the first
                60 cards on this page score from TMDB alone. This says what the
                score does, not what every row has. */}
            <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-text-muted">
              The Balasaur Score puts IMDb, Rotten Tomatoes, Metacritic and TMDB on one 0 to 100
              scale, and says so when the critics and the audience disagree.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="cursor-pointer rounded-[5px] border border-primary bg-primary px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Sign in to save your picks
            </button>
            <button
              type="button"
              onClick={onBrowse}
              className="cursor-pointer rounded-[5px] px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-text-muted transition-colors hover:text-text-bright"
            >
              Browse
            </button>
          </div>
        </div>
      </div>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </section>
  );
}
