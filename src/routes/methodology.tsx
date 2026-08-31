import { createFileRoute } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { SITE_ORIGIN, canonicalLink, buildMeta, cacheSsrResponse } from "@/lib/seo";

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
      <main id="main" className="mx-auto w-full max-w-[760px] flex-1 px-4 py-12">
        <h1 className="text-[28px] font-bold tracking-tight text-text-bright">Methodology</h1>
        <p className="mt-2 text-[15px] text-text-muted">
          How we score, rank, and refresh our catalog.
        </p>

        <div className="mt-10 space-y-12">
          <section>
            <h2 className="text-[18px] font-semibold text-text-bright">The Balasaur Score</h2>
            <div className="mt-3 space-y-4 text-[15px] leading-relaxed text-text">
              <p>
                The Balasaur Score is a 0 to 100 blend of ratings from IMDb, Rotten Tomatoes,
                Metacritic, and TMDB. When a source has no rating for a title, the remaining sources
                are renormalized so the scale still runs 0 to 100. These are the weights.
              </p>
              <table className="w-full max-w-[420px] border-collapse text-[14px]">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 pr-4 font-mono text-[11px] uppercase tracking-wider text-text-dim">
                      Source
                    </th>
                    <th className="py-2 pr-4 font-mono text-[11px] uppercase tracking-wider text-text-dim">
                      Weight
                    </th>
                    <th className="py-2 font-mono text-[11px] uppercase tracking-wider text-text-dim">
                      Share when all four are present
                    </th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  <tr className="border-b border-border">
                    <td className="py-2 pr-4 font-sans">IMDb</td>
                    <td className="py-2 pr-4">0.25</td>
                    <td className="py-2">41.7%</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 pr-4 font-sans">Rotten Tomatoes</td>
                    <td className="py-2 pr-4">0.125</td>
                    <td className="py-2">20.8%</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 pr-4 font-sans">Metacritic</td>
                    <td className="py-2 pr-4">0.125</td>
                    <td className="py-2">20.8%</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-sans">TMDB</td>
                    <td className="py-2 pr-4">0.10</td>
                    <td className="py-2">16.7%</td>
                  </tr>
                </tbody>
              </table>
              <p>
                TMDB carries the smallest weight because it is an audience score with looser
                standards than the others. It is also on nearly every title, which is why a card can
                almost always show one score instead of falling back to a raw star rating.
              </p>
              <p>
                A worked example. Inception holds 8.8 on IMDb, 87 on Rotten Tomatoes, 74 on
                Metacritic and 8.4 on TMDB. The two ten-point scales become 88 and 84, then (88
                times 0.25 plus 87 times 0.125 plus 74 times 0.125 plus 84 times 0.10) divided by
                0.60 gives 84.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-text-bright">Ranked Collections</h2>
            <div className="mt-3 space-y-4 text-[15px] leading-relaxed text-text">
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
            <div className="mt-3 space-y-4 text-[15px] leading-relaxed text-text">
              <p>
                The catalog syncs from TMDB and OMDb nightly. Every collection is rebuilt nightly to
                ensure rankings reflect the latest data. Each collection page displays its own
                rebuild date.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-text-bright">What we do not do</h2>
            <div className="mt-3 space-y-4 text-[15px] leading-relaxed text-text">
              <p>
                We do not accept editorial payola, we do not feature sponsored placements, and we do
                not use AI generated reviews. Data sources are credited to TMDB and OMDb.
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
