import { Suspense, useState } from "react";
import { ExternalLink } from "lucide-react";
import { MediaCard } from "./MediaCard";
import { usePersonDetail } from "@/hooks/usePersonDetail";
import type { PersonDetail as PersonDetailType } from "@/types/media";
import { tmdbImage } from "@/lib/tmdbImage";
import { personProse } from "@/lib/personProse";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2.5 text-[18px] font-black leading-none tracking-[-0.02em] text-text-bright">
      {children}
    </h2>
  );
}

function lifeLine(d: PersonDetailType): string | null {
  const parts: string[] = [];
  if (d.birthday) {
    const born = d.birthday.slice(0, 4);
    parts.push(d.deathday ? `${born}–${d.deathday.slice(0, 4)}` : `Born ${d.birthday}`);
  }
  if (d.placeOfBirth) parts.push(d.placeOfBirth);
  return parts.length ? parts.join(" · ") : null;
}

function Bio({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 360;
  return (
    <section>
      <SectionHeading>Biography</SectionHeading>
      <p
        className={
          "whitespace-pre-line text-[15px] leading-relaxed text-text-bright " +
          (!open && long ? "line-clamp-6" : "")
        }
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1.5 text-[13px] font-bold tracking-[-0.01em] text-primary hover:underline"
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </section>
  );
}

function PersonInner({ detail }: { detail: PersonDetailType }) {
  const life = lifeLine(detail);
  return (
    <article className="mx-auto max-w-[1100px] px-4 py-8 pb-16">
      {/* Header */}
      <header className="flex flex-col gap-5 sm:flex-row">
        <div className="w-[140px] shrink-0 overflow-hidden rounded-[8px] border border-border bg-panel">
          <div className="aspect-[2/3] w-full">
            {detail.profileUrl ? (
              <img
                src={tmdbImage(detail.profileUrl, "w342")}
                alt={detail.name}
                width={342}
                height={513}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[12px] font-semibold text-text-dim">
                No photo
              </div>
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[30px] font-black leading-[1.08] tracking-[-0.02em] text-text-bright md:text-[40px]">
            {detail.name}
          </h1>
          <p className="mt-2 font-mono text-[12px] tabular-nums tracking-wider text-text-muted">
            {[detail.knownForDepartment, life].filter(Boolean).join(" · ")}
          </p>
          {detail.imdbId && (
            <a
              href={`https://www.imdb.com/name/${detail.imdbId}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-[4px] border border-border px-2 py-1 text-[13px] font-semibold tracking-[-0.01em] text-text-muted hover:border-border-strong hover:text-text-bright"
            >
              IMDb <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </header>

      {/* Catalog statistics: claims only this database can make about the
          filmography rendered below, every figure derived from the same rows
          the cards are drawn from. */}
      {detail.catalog && personProse(detail.name, detail.catalog) && (
        <p className="mt-6 max-w-3xl text-[14px] leading-relaxed text-text">
          {personProse(detail.name, detail.catalog)}
        </p>
      )}

      {detail.biography && (
        <div className="mt-8 max-w-3xl">
          <Bio text={detail.biography} />
        </div>
      )}

      {/* The ranked opener. Ordered by the Balasaur Score printed on each
          poster, so a stranger can check the order against the page. The
          server returns nothing here when too few of the person's titles are
          scored for an order to carry a claim, and then the page simply opens
          on the filmography instead. */}
      {detail.catalog && detail.catalog.top.length > 0 && (
        <section className="mt-10">
          <SectionHeading>
            Highest rated{" "}
            <span className="font-mono text-base tabular-nums text-text-dim">
              {detail.catalog.top.length}
            </span>
          </SectionHeading>
          <div className="grid grid-cols-2 gap-x-3.5 gap-y-6 sm:grid-cols-3 md:grid-cols-6">
            {detail.catalog.top.map((it, i) => (
              <MediaCard
                key={it.id}
                item={it}
                eager={i < 6}
                posterOverlay={
                  <span
                    aria-hidden="true"
                    className="font-mono text-3xl font-bold tabular-nums leading-none text-white/95 [text-shadow:0_2px_10px_rgba(0,0,0,0.95)]"
                  >
                    {i + 1}
                  </span>
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* Works grouped by role, newest first: the order someone looking up a
          filmography expects to find it in. */}
      <div className="mt-10 space-y-8">
        {detail.groups.map((g) => (
          <section key={g.department}>
            <SectionHeading>
              {g.department}{" "}
              <span className="font-mono text-[13px] tabular-nums text-text-dim">
                {g.items.length}
              </span>
            </SectionHeading>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {g.items.map((it) => (
                <MediaCard key={it.id} item={it} />
              ))}
            </div>
          </section>
        ))}
        {detail.groups.length === 0 && (
          <p className="text-[14px] text-text-dim">
            No catalogued movies or TV for this person yet.
          </p>
        )}
      </div>
    </article>
  );
}

function PersonLoader() {
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8">
      <div className="flex gap-5">
        <div className="h-[210px] w-[140px] shrink-0 animate-pulse rounded-[8px] bg-panel" />
        <div className="flex-1 space-y-3 pt-2">
          <div className="h-8 w-2/3 animate-pulse rounded bg-panel" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-panel" />
        </div>
      </div>
    </div>
  );
}

function PersonFetcher({ id }: { id: string }) {
  const { data } = usePersonDetail(id);
  return <PersonInner detail={data} />;
}

export function PersonDetail({ id }: { id: string }) {
  return (
    <div className="min-h-screen bg-background">
      <main id="main">
        <Suspense fallback={<PersonLoader />}>
          <PersonFetcher id={id} />
        </Suspense>
      </main>
    </div>
  );
}
