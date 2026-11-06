import { createFileRoute } from "@tanstack/react-router";
import { ReadingPage, ReadingSection } from "@/components/balasaur/ReadingPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy: What Balasaur Stores and Why" },
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
    <ReadingPage
      title="Privacy Policy"
      dek={
        <span className="font-mono text-sm tabular-nums">Effective date: 14 September 2026</span>
      }
    >
      <p>
        Balasaur ("Balasaur," "we," "us") operates balasaur.com (the "Service"). This Privacy Policy
        explains what we collect, how we use it, and your choices.
      </p>

      <ReadingSection title="1. Information we collect">
        <ul className="list-disc space-y-3 pl-5 marker:text-text-dim">
          <li>
            Account information: your email address and authentication credentials (managed by our
            authentication provider) when you create an account.
          </li>
          <li>
            Activity and preferences: media you mark as seen, want, liked, or disliked; lists you
            create; and your filters and settings. This is how the Service personalizes your
            experience.
          </li>
          <li>
            Anonymous activity: if you use the Service without an account, your choices may be
            stored locally in your browser until you sign up.
          </li>
          <li>
            Profile information: a display name, a handle, and an optional bio and favorite genres.
            While your profile is set to public, that information and your watch activity appear on
            a page anyone on the web can open and search engines can index. You can turn your public
            profile off in your profile settings.
          </li>
          <li>
            Technical data: IP address, approximate region, device and browser type, and usage data,
            collected automatically. We may use approximate location to show streaming availability
            relevant to your region.
          </li>
          <li>Cookies and similar technologies (see "Cookies" below).</li>
        </ul>
      </ReadingSection>

      <ReadingSection title="2. How we use your information">
        <p>
          To provide and personalize the Service; to create and secure your account; to analyze and
          improve the Service; to communicate with you about your account; and to comply with legal
          obligations.
        </p>
      </ReadingSection>

      <ReadingSection title="3. Third-party data and services">
        <ul className="list-disc space-y-3 pl-5 marker:text-text-dim">
          <li>
            Content data (titles, ratings, availability) is provided by third parties including
            TMDB, OMDb (which aggregates ratings from sources such as IMDb, Rotten Tomatoes, and
            Metacritic), and JustWatch (streaming availability). We do not control and are not
            responsible for the accuracy of third-party data.
          </li>
          <li>
            We use third-party infrastructure to host the Service, store data, and authenticate
            users (including Supabase). With your consent we use Google Analytics and PostHog to
            measure usage, and in the future we may use advertising and payment providers. Each
            processes data per its own policies.
          </li>
          <li>
            PostHog records session replays: the pages as they appeared on your screen, including
            the text on them, and where you clicked or scrolled. Anything you type into a field is
            masked and never recorded, your email address is masked wherever the Service shows it,
            and replays are not linked to your account. Recording happens only with your consent and
            stops the moment you withdraw it.
          </li>
        </ul>
      </ReadingSection>

      <ReadingSection title="4. Cookies">
        <p>
          We use cookies and similar technologies. Strictly necessary cookies are required for the
          Service to function (e.g., keeping you signed in and remembering your cookie choices).
          With your consent, we also use non-essential cookies for analytics, which includes
          recognising you as a returning visitor, and in the future for advertising. You can manage
          your choices through our cookie banner at any time.
        </p>
      </ReadingSection>

      <ReadingSection title="5. How we share information">
        <p>
          We do not sell your personal information. We share it only with service providers acting
          on our behalf, when required by law, or in connection with a business transfer.
        </p>
        <p>
          A public profile is separate from that. While yours is set to public, your display name,
          handle, and watch activity are published on balasaur.com, where anyone can read them and
          search engines can index them. You can turn your public profile off in your profile
          settings, after which your watch activity no longer appears there and the page is no
          longer indexed.
        </p>
      </ReadingSection>

      <ReadingSection title="6. Data retention">
        <p>
          We keep your account information while your account is active. You can delete your account
          at any time, after which we delete or anonymize your personal data except where retention
          is required by law.
        </p>
      </ReadingSection>

      <ReadingSection title="7. Your rights">
        <p>
          Depending on your location, you may have the right to access, correct, delete, or export
          your personal data, and to object to or restrict certain processing. To exercise these
          rights, contact us at baladan@sentire-labs.com or use the account controls in the Service.
        </p>
      </ReadingSection>

      <ReadingSection title="8. International users">
        <p>
          The Service is operated from the United States and may be accessed globally. By using it,
          you understand your information may be processed in the United States and other countries.
        </p>
      </ReadingSection>

      <ReadingSection title="9. Children">
        <p>
          The Service is not directed to children under 13 (or the minimum age in your
          jurisdiction), and we do not knowingly collect their data.
        </p>
      </ReadingSection>

      <ReadingSection title="10. Security">
        <p>
          We use reasonable measures to protect your information, but no method of transmission or
          storage is completely secure.
        </p>
      </ReadingSection>

      <ReadingSection title="11. Changes">
        <p>
          We may update this Policy. Material changes will be posted here with a new effective date.
        </p>
      </ReadingSection>

      <ReadingSection title="12. Who operates Balasaur">
        <p>
          Balasaur is operated by Sentire Labs LLC, a limited liability company registered in New
          Jersey, United States. Sentire Labs builds interactive experiences for the web, and
          Balasaur is one of them. Sentire Labs is the data controller for the information described
          in this Policy.
        </p>
        <p>Questions: baladan@sentire-labs.com.</p>
      </ReadingSection>
    </ReadingPage>
  );
}
