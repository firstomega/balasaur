interface Props {
  onBrowse: () => void;
}

// The signed-out hero. Short on purpose: the trending row directly below and
// the grid are the demonstration, so the hero's whole job is one claim and
// one button, and the first posters must land inside a 390px first viewport.
// The v0 tag, the eyebrow, and the hero sign-in button are gone; the
// wordmark and sign-in already live in the TopBar 48px above.
//
// The h1 leads with the job (ending the what-do-we-watch scroll), not the
// score: the owner's positioning is discovery, not ratings. The score is the
// proof and lives in the subhead. No catalog count anywhere in the hero, on
// purpose: the grid's own counter renders on this same screen, and any
// second figure would contradict it.
export function LandingHero({ onBrowse }: Props) {
  return (
    <section
      aria-label="Welcome to Balasaur"
      className="mb-5 overflow-hidden rounded-[6px] border border-border bg-panel"
    >
      <div className="relative px-4 py-4 sm:px-6 sm:py-5">
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
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-[24px] font-semibold leading-tight text-text-bright sm:text-[28px]">
              Stop scrolling. Start watching.
            </h1>
            <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-text-muted">
              One score, built from IMDb, Rotten Tomatoes, Metacritic and TMDB, tells you which
              movies and TV shows are worth your night.
            </p>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={onBrowse}
              className="cursor-pointer rounded-[5px] border border-primary bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Browse the catalog
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
