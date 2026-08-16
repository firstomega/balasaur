import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { SITE_ORIGIN, canonicalLink, buildMeta, cacheSsrResponse } from "@/lib/seo";
import { Footer } from "@/components/balasaur/Footer";

export const Route = createFileRoute("/about")({
  loader: async () => {
    await cacheSsrResponse();
  },
  head: () => {
    const url = `${SITE_ORIGIN}/about`;
    return {
      meta: buildMeta({
        title: "About Balasaur, a Movie and TV Score Database",
        description: "What Balasaur is, who runs it, and where the data comes from.",
        url,
      }),
      links: [canonicalLink(url)],
    };
  },
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <TopBar />
      <main className="mx-auto w-full max-w-[760px] flex-1 px-4 py-12">
        <h1 className="text-[28px] font-bold tracking-tight text-text-bright">About Balasaur</h1>
        <p className="mt-2 text-[15px] text-text-muted">
          A movie and TV database built around one number.
        </p>

        <div className="mt-10 space-y-12">
          <section>
            <h2 className="text-[18px] font-semibold text-text-bright">The score</h2>
            <div className="mt-3 space-y-4 text-[14.5px] leading-relaxed text-text">
              <p>
                Every title here carries a Balasaur Score, a 0 to 100 blend of its ratings from
                IMDb, Rotten Tomatoes, Metacritic, and TMDB. The same film can sit at 7.1 on IMDb,
                93% on Rotten Tomatoes, and 74 on Metacritic. Those are different scales measuring
                different things, and deciding what to watch tonight should not require reconciling
                them yourself. The score does the reconciling. When critics and audiences genuinely
                split on a title, its page says so and names the gap.
              </p>
              <p>
                The exact weights and rules are public, on the{" "}
                <Link to="/methodology" className="text-text-bright underline underline-offset-2">
                  methodology page
                </Link>
                .
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-text-bright">The catalog</h2>
            <div className="mt-3 space-y-4 text-[14.5px] leading-relaxed text-text">
              <p>
                More than 66,000 movies and TV shows, synced from TMDB and OMDb every night.
                Rankings rebuild nightly too, so a list like Best on Netflix reflects what is on
                Netflix now, not what was there when the page was first written.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-text-bright">Who runs it</h2>
            <div className="mt-3 space-y-4 text-[14.5px] leading-relaxed text-text">
              <p>
                One person. Balasaur is not a media company. There are no sponsored placements, no
                paid rankings, and no AI written reviews. When a title sits first in a list, the
                data put it there.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-text-bright">Credits</h2>
            <div className="mt-3 space-y-4 text-[14.5px] leading-relaxed text-text">
              <p>
                This product uses the TMDB API but is not endorsed or certified by TMDB. Ratings
                come via OMDb. Streaming availability data is provided by JustWatch.
              </p>
              <p>
                Corrections, questions, or press:{" "}
                <Link to="/contact" className="text-text-bright underline underline-offset-2">
                  contact
                </Link>
                .
              </p>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
