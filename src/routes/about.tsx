import { createFileRoute, Link } from "@tanstack/react-router";
import { SITE_ORIGIN, canonicalLink, buildMeta, cacheSsrResponse } from "@/lib/seo";
import { CATALOG_FLOOR_LABEL } from "@/lib/catalogCount";
import { ReadingPage, ReadingSection, READING_LINK } from "@/components/balasaur/ReadingPage";

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
    <ReadingPage title="About Balasaur" dek="A movie and TV database built around one number.">
      <ReadingSection title="The score">
        <p>
          Every title here carries a Balasaur Score, a 0 to 100 blend of its ratings from IMDb,
          Rotten Tomatoes, Metacritic, and TMDB. The same film can sit at 7.1 on IMDb, 93% on Rotten
          Tomatoes, and 74 on Metacritic. Those are different scales measuring different things. The
          Balasaur Score puts them on one.
        </p>
        <p>
          The exact weights and rules are public, on the{" "}
          <Link to="/methodology" className={READING_LINK}>
            methodology page
          </Link>
          .
        </p>
      </ReadingSection>

      <ReadingSection title="The catalog">
        <p>
          More than {CATALOG_FLOOR_LABEL} movies and TV shows from TMDB and OMDb. The sync runs
          every night and works through the catalog oldest first, so every title comes back around
          for a re-check. Rankings rebuild nightly too, so a list like Best on Netflix reflects what
          is on Netflix now, not what was there when the page was first written.
        </p>
      </ReadingSection>

      <ReadingSection title="Who runs it">
        <p>
          One person. Balasaur is a product of Sentire Labs LLC, a New Jersey company that builds
          interactive experiences for the web.
        </p>
        <p>
          Balasaur is not a media company. There are no sponsored placements, no paid rankings, and
          no AI written reviews. The order of every list comes from the score alone.
        </p>
      </ReadingSection>

      <ReadingSection title="Credits">
        <p>
          This product uses the TMDB API but is not endorsed or certified by TMDB. Ratings come via
          OMDb. Streaming availability data is provided by JustWatch.
        </p>
        <p>
          Corrections, questions, or press:{" "}
          <Link to="/contact" className={READING_LINK}>
            contact
          </Link>
          .
        </p>
      </ReadingSection>
    </ReadingPage>
  );
}
