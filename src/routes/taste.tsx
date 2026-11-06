import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { EMPTY_ACTION_CLASS } from "@/components/balasaur/EmptyState";
import { TasteCardPreview } from "@/components/balasaur/TasteCardPreview";
import { useUserStatus } from "@/hooks/useUserStatus";
import { getTasteFacts } from "@/lib/taste.functions";
import {
  ARCHETYPES,
  MAX_FACT_IDS,
  MIN_BASIS_TITLES,
  computeTaste,
  tasteReadiness,
  type TasteProfile,
  type TitleFact,
} from "@/lib/taste";
import { sampleTasteProfile } from "@/lib/tasteSample";
import { SITE_ORIGIN, canonicalLink } from "@/lib/seo";

// The page a shared card links back to, so most of the people who ever see it
// arrive from somebody else's image having rated nothing. It therefore opens on
// a card every time: an example drawn from a fixed shelf of catalog titles until
// the visitor's own list can name them, and theirs from that moment on. There is
// no state of this page in which the first thing is a locked box.
//
// The card is the heading. It prints the archetype and the sentence that proves
// it, so the page does not print them again above it.
//
// The explanation and the archetype table are server-rendered and identical for
// everyone, so the CDN can hold the page; every card is drawn in the browser.

export const Route = createFileRoute("/taste")({
  head: () => ({
    meta: [
      { title: "Taste Card | Balasaur" },
      {
        name: "description",
        content:
          "One image with the name your list earns and the four highest-scoring titles on it.",
      },
      // A page whose whole point is one visitor's own list has nothing to
      // offer a search result.
      { name: "robots", content: "noindex,follow" },
    ],
    links: [canonicalLink(SITE_ORIGIN + "/taste")],
  }),
  component: TastePage,
});

function TastePage() {
  return (
    <div className="bg-background text-foreground">
      <main id="main" className="mx-auto w-full max-w-article px-4 pb-12 pt-6 md:pt-9">
        <h1 className="font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-text-bright md:text-[64px]">
          Taste Card
        </h1>
        <p className="mt-3 max-w-prose text-lg leading-relaxed text-text-muted">
          The name your list earns and the four highest-scoring titles on it.
        </p>

        <CardSection />

        <section className="mt-12 border-t border-border pt-8">
          <h2 className="font-display text-3xl font-extrabold leading-none tracking-tight text-text-bright">
            The names a card can take
          </h2>
          <p className="mt-3 max-w-prose text-lg leading-relaxed text-text-muted">
            A card takes the name whose rule your list clears by the widest margin. Every rule is a
            share of one number, and that number is printed on the card.
          </p>
          <ul className="mt-5 divide-y divide-border border-y border-border">
            {ARCHETYPES.map((a) => (
              <li key={a.key} className="flex flex-col gap-1 py-3.5 sm:flex-row sm:items-baseline">
                <span className="w-[220px] shrink-0 font-display text-2xl font-extrabold leading-none tracking-tight text-text-bright">
                  {a.name}
                </span>
                <span className="text-lg leading-relaxed text-foreground">{a.rule}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

function cardOptions(profile: TasteProfile) {
  return {
    name: profile.archetype!.name,
    evidence: profile.archetype!.evidence,
    counts: profile.counts,
    decades: profile.decadeCount,
    posters: profile.posters,
  };
}

/** Everything personal, after mount. Nothing here reaches the server render. */
function CardSection() {
  const { statuses, ready } = useUserStatus();
  const factsFn = useServerFn(getTasteFacts);
  const [facts, setFacts] = useState<TitleFact[] | null>(null);
  const [factsFailed, setFactsFailed] = useState(false);

  const readiness = useMemo(() => tasteReadiness(statuses), [statuses]);

  // The ids the archetype could describe: everything marked watched, newest
  // first, so a long history is cut at the end the visitor cares least about.
  const ids = useMemo(() => {
    if (!readiness.ready) return [];
    return Object.entries(statuses)
      .filter(([, r]) => r?.status === "seen")
      .sort((a, b) => (b[1].ts ?? 0) - (a[1].ts ?? 0))
      .slice(0, MAX_FACT_IDS)
      .map(([id]) => id);
  }, [statuses, readiness.ready]);

  const idKey = ids.join(",");
  useEffect(() => {
    if (ids.length === 0) return;
    let cancelled = false;
    setFactsFailed(false);
    (async () => {
      try {
        const rows = (await factsFn({ data: { ids } })) as TitleFact[];
        if (!cancelled) setFacts(rows);
      } catch {
        if (!cancelled) setFactsFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  const profile = useMemo(() => (facts ? computeTaste(statuses, facts) : null), [statuses, facts]);
  const sample = useMemo(() => sampleTasteProfile(), []);

  // Theirs the moment it exists. Until then, the example.
  if (profile?.archetype) {
    return (
      <section className="mt-9">
        <TasteCardPreview options={cardOptions(profile)} />
      </section>
    );
  }

  return (
    <section className="mt-9">
      <TasteCardPreview
        options={cardOptions(sample)}
        example
        note={exampleLine(ready, readiness.ready, readiness.needed, factsFailed, profile)}
        action={
          <Link to="/watched" className={EMPTY_ACTION_CLASS}>
            Rate titles
          </Link>
        }
      />
    </section>
  );
}

/**
 * One line under the example card: what stands between this visitor and their
 * own, as a number they can check against their own list. The chip on the card
 * already says the card is an example, so this line never says it again.
 */
function exampleLine(
  statusesReady: boolean,
  enough: boolean,
  needed: number,
  factsFailed: boolean,
  profile: TasteProfile | null,
): string {
  if (factsFailed) return "The Taste Card did not load. Reload the page to try again.";
  if (!statusesReady || (enough && !profile)) return "Loading your Taste Card.";
  if (!enough) {
    return needed === MIN_BASIS_TITLES
      ? `A Taste Card needs ${MIN_BASIS_TITLES} rated titles.`
      : `A Taste Card needs ${MIN_BASIS_TITLES} rated titles. You have rated ${MIN_BASIS_TITLES - needed}.`;
  }
  return `A Taste Card needs ${MIN_BASIS_TITLES} rated titles from the catalog. ${profile?.total ?? 0} of yours are in it.`;
}
