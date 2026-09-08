import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { TopBar } from "@/components/balasaur/TopBar";
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
          "One image with the name your list earns, the four titles you scored highest, and the one you liked that critics did not.",
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
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[760px] px-5 py-10">
        <h1 className="text-[32px] font-black leading-[1.05] tracking-[-0.02em] text-text-bright sm:text-[40px]">
          Taste Card
        </h1>
        <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-text-muted">
          The name your list earns, the four titles you scored highest, and the one you liked that
          critics did not.
        </p>

        <CardSection />

        <section className="mt-12 border-t border-border pt-8">
          <h2 className="text-[20px] font-black tracking-[-0.02em] text-text-bright">
            The names a card can take
          </h2>
          <p className="mt-2 max-w-prose text-[14px] leading-relaxed text-text-muted">
            A card takes the name whose rule your list clears by the widest margin. Every rule is a
            share of one number, and that number is printed on the card.
          </p>
          <ul className="mt-5 divide-y divide-border border-y border-border">
            {ARCHETYPES.map((a) => (
              <li key={a.key} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline">
                <span className="w-[220px] shrink-0 text-[15px] font-black tracking-[-0.01em] text-text-bright">
                  {a.name}
                </span>
                <span className="text-[14px] leading-relaxed text-text-muted">{a.rule}</span>
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
    contrarian: profile.contrarian?.line ?? null,
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
        {profile.contrarian && (
          <p className="mt-4 text-center text-[13px] text-text-dim">
            Critic score from {profile.contrarian.criticSource}
          </p>
        )}
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
  if (factsFailed) return "The catalog did not answer, so reload to draw yours.";
  if (!statusesReady || (enough && !profile)) return "Yours is on its way.";
  if (!enough) {
    return needed === MIN_BASIS_TITLES
      ? `Yours draws at ${MIN_BASIS_TITLES} rated titles.`
      : `Yours draws at ${MIN_BASIS_TITLES} rated titles, and you are ${needed} short.`;
  }
  return `Yours draws at ${MIN_BASIS_TITLES} rated titles the catalog knows, and it has ${profile?.total ?? 0} of yours.`;
}
