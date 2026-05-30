import { createFileRoute } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy · Balasaur" },
      {
        name: "description",
        content:
          "How Balasaur collects, uses, and protects your information when you use balasaur.com.",
      },
      { property: "og:title", content: "Privacy Policy · Balasaur" },
      {
        property: "og:description",
        content:
          "How Balasaur collects, uses, and protects your information when you use balasaur.com.",
      },
    ],
    links: [{ rel: "canonical", href: "https://balasaur.com/privacy" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="mx-auto max-w-[720px] px-5 py-12">
        <header className="mb-10 border-b border-border pb-6">
          <h1 className="font-sans text-3xl font-semibold tracking-tight text-text-bright">
            Privacy Policy
          </h1>
          <p className="mt-2 font-mono text-[12px] uppercase tracking-wider text-text-dim">
            Effective date: [EFFECTIVE DATE]
          </p>
        </header>

        <article className="space-y-8 text-[15px] leading-relaxed text-foreground">
          <p>
            Balasaur ("Balasaur," "we," "us") operates balasaur.com (the
            "Service"). This Privacy Policy explains what we collect, how we
            use it, and your choices.
          </p>

          <Section title="1. Information we collect">
            <ul className="list-disc space-y-2 pl-5 marker:text-text-dim">
              <li>
                Account information: your email address and authentication
                credentials (managed by our authentication provider) when you
                create an account.
              </li>
              <li>
                Activity and preferences: media you mark as seen, want, liked,
                or disliked; lists you create; and your filters and settings.
                This is how the Service personalizes your experience.
              </li>
              <li>
                Anonymous activity: if you use the Service without an account,
                your choices may be stored locally in your browser until you
                sign up.
              </li>
              <li>
                Technical data: IP address, approximate region, device and
                browser type, and usage data, collected automatically. We may
                use approximate location to show streaming availability
                relevant to your region.
              </li>
              <li>
                Cookies and similar technologies (see "Cookies" below).
              </li>
            </ul>
          </Section>

          <Section title="2. How we use your information">
            <p>
              To provide and personalize the Service; to create and secure
              your account; to analyze and improve the Service; to communicate
              with you about your account; and to comply with legal
              obligations.
            </p>
          </Section>

          <Section title="3. Third-party data and services">
            <ul className="list-disc space-y-2 pl-5 marker:text-text-dim">
              <li>
                Content data (titles, ratings, availability) is provided by
                third parties including TMDB, OMDb (which aggregates ratings
                from sources such as IMDb, Rotten Tomatoes, and Metacritic),
                and JustWatch (streaming availability). We do not control and
                are not responsible for the accuracy of third-party data.
              </li>
              <li>
                We use third-party infrastructure to host the Service, store
                data, and authenticate users (including Supabase). We may use
                analytics and, in the future, advertising and payment
                providers, which process data per their own policies.
              </li>
            </ul>
          </Section>

          <Section title="4. Cookies">
            <p>
              We use cookies and similar technologies. Strictly necessary
              cookies are required for the Service to function (e.g., keeping
              you signed in and remembering your cookie choices). With your
              consent, we also use non-essential cookies for analytics and, in
              the future, advertising. You can manage your choices through our
              cookie banner at any time.
            </p>
          </Section>

          <Section title="5. How we share information">
            <p>
              We do not sell your personal information. We share it only with
              service providers acting on our behalf, when required by law, or
              in connection with a business transfer.
            </p>
          </Section>

          <Section title="6. Data retention">
            <p>
              We keep your account information while your account is active.
              You can delete your account at any time, after which we delete
              or anonymize your personal data except where retention is
              required by law.
            </p>
          </Section>

          <Section title="7. Your rights">
            <p>
              Depending on your location, you may have the right to access,
              correct, delete, or export your personal data, and to object to
              or restrict certain processing. To exercise these rights,
              contact us at [CONTACT EMAIL] or use the account controls in
              the Service.
            </p>
          </Section>

          <Section title="8. International users">
            <p>
              The Service is operated from the United States and may be
              accessed globally. By using it, you understand your information
              may be processed in the United States and other countries.
            </p>
          </Section>

          <Section title="9. Children">
            <p>
              The Service is not directed to children under 13 (or the
              minimum age in your jurisdiction), and we do not knowingly
              collect their data.
            </p>
          </Section>

          <Section title="10. Security">
            <p>
              We use reasonable measures to protect your information, but no
              method of transmission or storage is completely secure.
            </p>
          </Section>

          <Section title="11. Changes">
            <p>
              We may update this Policy. Material changes will be posted here
              with a new effective date.
            </p>
          </Section>

          <Section title="12. Contact">
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