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
            <h1 className="text-[22px] font-semibold leading-tight text-text-bright sm:text-[26px]">
              Your personal entertainment database.
            </h1>
            <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-text-muted">
              Discover, track, and rate movies &amp; TV — and build a library that's
              yours.
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
              className="cursor-pointer rounded-[5px] border border-border-strong bg-background px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-text-bright transition-colors hover:border-primary hover:text-primary"
            >
              Start browsing
            </button>
          </div>
        </div>
      </div>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </section>
  );
}