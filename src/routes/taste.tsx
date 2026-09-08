import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { TopBar } from "@/components/balasaur/TopBar";
import { EmptyState, EMPTY_ACTION_CLASS } from "@/components/balasaur/EmptyState";
import { TasteCardPreview } from "@/components/balasaur/TasteCardPreview";
import { useUserStatus } from "@/hooks/useUserStatus";
import { getTasteFacts } from "@/lib/taste.functions";
import {
  ARCHETYPES,
  MAX_FACT_IDS,
  MIN_BASIS_TITLES,
  computeTaste,
  tasteReadiness,
  type TitleFact,
} from "@/lib/taste";
import { SITE_ORIGIN, canonicalLink } from "@/lib/seo";

// The page a shared card links back to. It carries two audiences at once: a
// stranger arriving from an image, who has never rated anything and needs to
// know what the thing they are looking at claims, and the visitor who came to
// draw their own. The explanation and the archetype table are server-rendered
// and identical for everyone, so the CDN can hold the page; the card is drawn
// in the browser from the visitor's own list after mount.

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
          One image, 1080 by 1920, carrying the name your list earns, the sentence that proves it,
          your four highest-scoring titles with their scores, and the one you liked that critics did
          not.
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

  if (!ready) {
    return <p className="mt-8 text-[14px] text-text-dim">Reading your list.</p>;
  }

  if (!readiness.ready) {
    const rated = Math.max(readiness.liked, readiness.watched);
    return (
      <div className="mt-8">
        <EmptyState
          line={
            rated === 0
              ? `The card draws at ${MIN_BASIS_TITLES} titles.`
              : `You have rated ${rated}. The card draws at ${MIN_BASIS_TITLES}.`
          }
          hint="Anything you mark watched or Loved counts, signed in or not."
          mood="calm"
          action={
            <Link to="/watched" className={EMPTY_ACTION_CLASS}>
              Rate titles
            </Link>
          }
        />
      </div>
    );
  }

  if (factsFailed) {
    return (
      <p className="mt-8 text-[14px] text-text-muted">
        The catalog did not answer. Reload to draw the card.
      </p>
    );
  }

  if (!profile) {
    return <p className="mt-8 text-[14px] text-text-dim">Reading your list.</p>;
  }

  if (!profile.archetype) {
    return (
      <div className="mt-8">
        <EmptyState
          line={`${profile.total} of your titles are in the catalog. The card draws at ${MIN_BASIS_TITLES}.`}
          hint="Rate a few more and it fills in."
          mood="calm"
          action={
            <Link to="/watched" className={EMPTY_ACTION_CLASS}>
              Rate titles
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <section className="mt-9">
      <h2 className="text-[28px] font-black leading-[1.05] tracking-[-0.02em] text-text-bright sm:text-[34px]">
        {profile.archetype.name}
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-text-muted">
        {profile.archetype.evidence}
      </p>
      <TasteCardPreview
        className="mt-6"
        options={{
          name: profile.archetype.name,
          evidence: profile.archetype.evidence,
          counts: profile.counts,
          decades: profile.decadeCount,
          posters: profile.posters,
          contrarian: profile.contrarian?.line ?? null,
        }}
      />
      {profile.contrarian && (
        <p className="mt-5 text-center text-[13px] text-text-dim">
          Critic score from {profile.contrarian.criticSource}
        </p>
      )}
    </section>
  );
}
