import { Link } from "@tanstack/react-router";
import { openCookieSettings } from "@/lib/consent";
import { SITE_TAGLINE } from "@/lib/seo";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-panel">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-5 px-4 py-8 text-sm leading-relaxed text-text-muted md:flex-row md:items-start md:justify-between md:py-10">
        <div className="space-y-1">
          {/* The site's one tagline, held in src/lib/seo.ts so the footer, the
              signed-out hero, the share card and the meta description cannot
              say four different things again. */}
          <p className="pb-1 font-display text-xl font-extrabold leading-tight tracking-tight text-text-bright md:text-2xl">
            {SITE_TAGLINE}.
          </p>
          <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
          <p>Streaming availability data provided by JustWatch.</p>
          <p>Ratings via OMDb (IMDb, Rotten Tomatoes, Metacritic).</p>
        </div>
        <div className="flex flex-col gap-2 md:items-end">
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-base font-semibold text-text-bright">
            <Link to="/about" className="hover:underline">
              About
            </Link>
            <Link to="/contact" className="hover:underline">
              Contact
            </Link>
            <Link to="/privacy" className="hover:underline">
              Privacy
            </Link>
            <Link to="/terms" className="hover:underline">
              Terms
            </Link>
            <button type="button" onClick={openCookieSettings} className="hover:underline">
              Cookie settings
            </button>
          </nav>
          {/* The year is read from the clock at render. Around New Year the
              cached page and a visitor's clock can disagree for a few hours;
              a text difference here is not worth rebuilding the page over. */}
          <p suppressHydrationWarning>© {year} Balasaur.</p>
        </div>
      </div>
    </footer>
  );
}
