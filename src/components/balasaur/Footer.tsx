import { Link } from "@tanstack/react-router";
import { openCookieSettings } from "@/lib/consent";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-6 font-mono text-[11px] leading-relaxed text-text-dim md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p>
            This product uses the TMDB API but is not endorsed or certified by
            TMDB.
          </p>
          <p>Streaming availability data provided by JustWatch.</p>
          <p>Ratings via OMDb (IMDb, Rotten Tomatoes, Metacritic).</p>
        </div>
        <div className="flex flex-col gap-2 md:items-end">
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-text-muted">
            <Link to="/privacy" className="hover:text-text-bright">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-text-bright">
              Terms
            </Link>
            <button
              type="button"
              onClick={openCookieSettings}
              className="hover:text-text-bright"
            >
              Cookie settings
            </button>
          </nav>
          <p>© {year} Balasaur.</p>
        </div>
      </div>
    </footer>
  );
}