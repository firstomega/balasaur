import { createFileRoute } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { SITE_ORIGIN, canonicalLink, buildMeta, cacheSsrResponse } from "@/lib/seo";
import { Footer } from "@/components/balasaur/Footer";

export const Route = createFileRoute("/methodology")({
  loader: async () => {
    await cacheSsrResponse();
  },
  head: () => {
    const url = `${SITE_ORIGIN}/methodology`;
    return {
      meta: buildMeta({
        title: "Methodology: How the Balasaur Score Is Built",
        description: "How the Balasaur Score works and how ranked collections are built.",
        url,
      }),
      links: [canonicalLink(url)],
    };
  },
  component: MethodologyPage,
});

function MethodologyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <TopBar />
      <main className="mx-auto w-full max-w-[760px] flex-1 px-4 py-12">
        <h1 className="text-[28px] font-bold tracking-tight text-text-bright">Methodology</h1>
        <p className="mt-2 text-[15px] text-text-muted">
          How we score, rank, and refresh our catalog.
        </p>

        <div className="mt-10 space-y-12">
          <section>
            <h2 className="text-[18px] font-semibold text-text-bright">The Balasaur Score</h2>
            <div className="mt-3 space-y-4 text-[14.5px] leading-relaxed text-text">
              <p>
                The Balasaur Score is a 0 to 100 blend of ratings from IMDb, Rotten Tomatoes,
                Metacritic, and TMDB. We combine these external scores using fixed weights. When a
                source is missing data for a specific title, the remaining scores are renormalized
                to preserve the 0 to 100 scale.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-text-bright">Ranked Collections</h2>
            <div className="mt-3 space-y-4 text-[14.5px] leading-relaxed text-text">
              <p>
                A collection only makes the cut when enough qualifying titles exist. A qualifying
                title must have a poster, synopsis, score, and no flagged content.
              </p>
              <p>
                Membership in a ranked list favors titles with many ratings, utilizing a Bayesian
                vote confidence adjustment. Display order within the collection is strictly
                determined by the Balasaur Score.
              </p>
              <p>
                A list ends where its quality falls off. Every collection keeps at least its top 12,
                no title makes the page scoring more than 25 points behind that collection's leader,
                and no list runs past 60. Strong shelves run long, thin shelves stop short.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-text-bright">Freshness</h2>
            <div className="mt-3 space-y-4 text-[14.5px] leading-relaxed text-text">
              <p>
                The catalog syncs from TMDB and OMDb nightly. Every collection is rebuilt nightly to
                ensure rankings reflect the latest data. Each collection page displays its own
                rebuild date.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-text-bright">What we do not do</h2>
            <div className="mt-3 space-y-4 text-[14.5px] leading-relaxed text-text">
              <p>
                We do not accept editorial payola, we do not feature sponsored placements, and we do
                not use AI generated reviews. Data sources are credited to TMDB and OMDb.
              </p>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
