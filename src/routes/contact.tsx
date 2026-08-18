import { createFileRoute } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { SITE_ORIGIN, canonicalLink, buildMeta, cacheSsrResponse } from "@/lib/seo";
import { Footer } from "@/components/balasaur/Footer";

const CONTACT_EMAIL = "balasaur@ranklist.com";

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
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[760px] flex-1 px-4 py-12">
        <h1 className="text-[28px] font-bold tracking-tight text-text-bright">Contact</h1>
        <p className="mt-2 text-[15px] text-text-muted">
          Balasaur is run by one person, and that person reads this inbox.
        </p>

        <div className="mt-10 space-y-12">
          <section>
            <h2 className="text-[18px] font-semibold text-text-bright">Email</h2>
            <div className="mt-3 space-y-4 text-[14.5px] leading-relaxed text-text">
              <p>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-[16px] font-semibold text-text-bright underline underline-offset-2"
                >
                  {CONTACT_EMAIL}
                </a>
              </p>
              <p>Expect a reply within a few days.</p>
            </div>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-text-bright">Worth writing about</h2>
            <div className="mt-3 space-y-4 text-[14.5px] leading-relaxed text-text">
              <p>
                A wrong or stale fact. Scores and streaming availability sync nightly, so when an
                upstream source has already corrected itself the fix lands here within a day. When
                it has not, say what is wrong and on which page, and it gets fixed at the source.
              </p>
              <p>Licensing, data, and press inquiries.</p>
              <p>Anything broken. A page that scrolls sideways, a ranking that makes no sense.</p>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
