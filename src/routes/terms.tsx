import { createFileRoute } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions · Balasaur" },
      {
        name: "description",
        content:
          "The terms that govern your use of balasaur.com, including acceptable use, accounts, and third-party data.",
      },
      { property: "og:title", content: "Terms & Conditions · Balasaur" },
      {
        property: "og:description",
        content:
          "The terms that govern your use of balasaur.com, including acceptable use, accounts, and third-party data.",
      },
    ],
    links: [{ rel: "canonical", href: "https://balasaur.com/terms" }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="mx-auto max-w-[720px] px-5 py-12">
        <header className="mb-10 border-b border-border pb-6">
          <h1 className="font-sans text-3xl font-semibold tracking-tight text-text-bright">
            Terms &amp; Conditions
          </h1>
          <p className="mt-2 font-mono text-[12px] uppercase tracking-wider text-text-dim">
            Effective date: [EFFECTIVE DATE]
          </p>
        </header>

        <article className="space-y-8 text-[15px] leading-relaxed text-foreground">
          <p>
            These Terms govern your use of balasaur.com (the "Service"),
            operated by Balasaur ("we," "us"). By using the Service, you agree
            to these Terms.
          </p>

          <Section title="1. Eligibility & accounts">
            <p>
              You must be at least 13 (or the minimum age in your
              jurisdiction). You are responsible for your account and for
              keeping your credentials secure, and you agree to provide
              accurate information.
            </p>
          </Section>

          <Section title="2. Acceptable use">
            <p>
              You agree not to misuse the Service, including by violating
              laws; disrupting or attempting unauthorized access; scraping or
              harvesting data at scale; or uploading unlawful, infringing, or
              harmful content.
            </p>
          </Section>

          <Section title="3. User content">
            <p>
              You retain ownership of content you create (such as lists). You
              grant us a non-exclusive license to host and display it as
              needed to operate the Service. You are responsible for what you
              create and share.
            </p>
          </Section>

          <Section title="4. Third-party data and links">
            <p>
              The Service displays data from third parties (including TMDB,
              OMDb, IMDb, Rotten Tomatoes, Metacritic, and JustWatch) and may
              link to third-party sites. We do not guarantee the accuracy,
              availability, or completeness of this data and are not
              responsible for third-party services. This product uses the
              TMDB API but is not endorsed or certified by TMDB.
            </p>
          </Section>

          <Section title="5. Intellectual property">
            <p>
              The Service, including its design and original content, is
              owned by us and protected by law. Third-party trademarks and
              content belong to their respective owners.
            </p>
          </Section>

          <Section title="6. Disclaimers">
            <p>
              The Service is provided "as is" and "as available," without
              warranties of any kind, to the fullest extent permitted by law.
              We do not warrant that it will be uninterrupted, error-free, or
              that data will be accurate.
            </p>
          </Section>

          <Section title="7. Limitation of liability">
            <p>
              To the fullest extent permitted by law, we are not liable for
              any indirect, incidental, or consequential damages, or for any
              loss arising from your use of the Service.
            </p>
          </Section>

          <Section title="8. Termination">
            <p>
              We may suspend or terminate access for any reason, including
              violation of these Terms. You may stop using the Service and
              delete your account at any time.
            </p>
          </Section>

          <Section title="9. Changes">
            <p>
              We may modify these Terms. Continued use after changes
              constitutes acceptance.
            </p>
          </Section>

          <Section title="10. Governing law">
            <p>
              These Terms are governed by the laws of [YOUR STATE/COUNTRY],
              without regard to conflict-of-laws rules.
            </p>
          </Section>

          <Section title="11. Contact">
            <p>Questions: [CONTACT EMAIL].</p>
          </Section>
        </article>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 font-mono text-[13px] font-semibold uppercase tracking-wider text-text-bright">
        {title}
      </h2>
      <div className="space-y-3 text-text-muted">{children}</div>
    </section>
  );
}