import { createFileRoute } from "@tanstack/react-router";
import { SITE_ORIGIN, canonicalLink, buildMeta, cacheSsrResponse } from "@/lib/seo";
import { ReadingPage, ReadingSection } from "@/components/balasaur/ReadingPage";

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

const TH = "py-2 pr-4 text-sm font-bold uppercase tracking-wider text-text-dim last:pr-0";
const TD = "py-2 pr-4 last:pr-0";

function MethodologyPage() {
  return (
    <ReadingPage title="Methodology" dek="How we score, rank, and refresh our catalog.">
      <ReadingSection title="The Balasaur Score">
        <p>
          The Balasaur Score is a 0 to 100 blend of ratings from IMDb, Rotten Tomatoes, Metacritic,
          and TMDB. When a source has no rating for a title, the remaining sources are renormalized
          so the scale still runs 0 to 100. These are the weights.
        </p>
        <table className="w-full border-collapse text-lg leading-normal">
          <thead>
            <tr className="border-b-2 border-text-bright text-left align-bottom">
              <th className={TH}>Source</th>
              <th className={TH}>Weight</th>
              <th className={TH}>Share when all four are present</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            <tr className="border-b border-border">
              <td className={`${TD} font-sans`}>IMDb</td>
              <td className={TD}>0.25</td>
              <td className={TD}>41.7%</td>
            </tr>
            <tr className="border-b border-border">
              <td className={`${TD} font-sans`}>Rotten Tomatoes</td>
              <td className={TD}>0.125</td>
              <td className={TD}>20.8%</td>
            </tr>
            <tr className="border-b border-border">
              <td className={`${TD} font-sans`}>Metacritic</td>
              <td className={TD}>0.125</td>
              <td className={TD}>20.8%</td>
            </tr>
            <tr>
              <td className={`${TD} font-sans`}>TMDB</td>
              <td className={TD}>0.10</td>
              <td className={TD}>16.7%</td>
            </tr>
          </tbody>
        </table>
        <p>
          TMDB carries the smallest weight because it is an audience score with looser standards
          than the others. It is also on nearly every title, which is why a card can almost always
          show one score instead of falling back to a raw star rating.
        </p>
        <p>
          A worked example. Inception holds 8.8 on IMDb, 86 on Rotten Tomatoes, 74 on Metacritic and
          8.4 on TMDB. The two ten-point scales become 88 and 84, then (88 times 0.25 plus 86 times
          0.125 plus 74 times 0.125 plus 84 times 0.10) divided by 0.60 gives 84.
        </p>
      </ReadingSection>

      <ReadingSection title="Ranked lists">
        <p>
          A collection is published only when enough qualifying titles exist. A qualifying title has
          a poster, a synopsis, a score, and no flagged content.
        </p>
        <p>
          Membership in a ranked list favors titles with many ratings, through a Bayesian adjustment
          for vote count. Order within the collection is set by the Balasaur Score alone.
        </p>
        <p>
          A list ends where its quality falls off. Every collection keeps at least its top 12, no
          title makes the page scoring more than 25 points behind that collection's leader, and no
          list runs past 60.
        </p>
      </ReadingSection>

      <ReadingSection title="Freshness">
        <p>
          Titles refresh from TMDB and OMDb on a nightly sync that works through the catalog oldest
          first, so every title is re-checked on a rolling cycle. Every collection is rebuilt
          nightly from the latest scores. Each collection page shows its own rebuild date.
        </p>
      </ReadingSection>

      <ReadingSection title="What we do not do">
        <p>
          We do not accept editorial payola, we do not feature sponsored placements, and we do not
          use AI generated reviews. Data sources are credited to TMDB and OMDb.
        </p>
      </ReadingSection>
    </ReadingPage>
  );
}
