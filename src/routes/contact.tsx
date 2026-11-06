import { createFileRoute } from "@tanstack/react-router";
import { SITE_ORIGIN, canonicalLink, buildMeta, cacheSsrResponse } from "@/lib/seo";
import { ReadingPage, ReadingSection, READING_LINK } from "@/components/balasaur/ReadingPage";

const CONTACT_EMAIL = "baladan@sentire-labs.com";

export const Route = createFileRoute("/contact")({
  loader: async () => {
    await cacheSsrResponse();
  },
  head: () => {
    const url = `${SITE_ORIGIN}/contact`;
    return {
      meta: buildMeta({
        title: "Contact Balasaur: Corrections and Licensing",
        description: "How to reach the person who runs Balasaur.",
        url,
      }),
      links: [canonicalLink(url)],
    };
  },
  component: ContactPage,
});

function ContactPage() {
  return (
    <ReadingPage
      title="Contact"
      dek="Balasaur is run by one person, and that person reads this inbox."
    >
      <ReadingSection title="Email">
        <p>
          <a href={`mailto:${CONTACT_EMAIL}`} className={`${READING_LINK} break-all`}>
            {CONTACT_EMAIL}
          </a>
        </p>
        <p>Expect a reply within a few days.</p>
      </ReadingSection>

      <ReadingSection title="Worth writing about">
        <p>
          A wrong or stale fact. Scores and streaming availability refresh on a rolling nightly
          cycle that works through the catalog oldest first, so a correction made upstream reaches
          the page on its own. When the source is still wrong, say what is wrong and on which page,
          and it gets fixed at the source.
        </p>
        <p>Licensing, data, and press inquiries.</p>
        <p>Anything broken. A page that scrolls sideways, a ranking that makes no sense.</p>
      </ReadingSection>
    </ReadingPage>
  );
}
