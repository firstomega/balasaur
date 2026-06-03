import { Suspense, useState } from "react";
import { ExternalLink } from "lucide-react";
import { TopBar } from "./TopBar";
import { MediaCard } from "./MediaCard";
import { usePersonDetail } from "@/hooks/usePersonDetail";
import type { PersonDetail as PersonDetailType } from "@/types/media";
import { tmdbImage } from "@/lib/tmdbImage";

function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-text-dim">
      {children}
    </div>
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
      <MicroLabel>Biography</MicroLabel>
      <p
        className={
          "whitespace-pre-line text-[14px] leading-relaxed text-text-bright " +
          (!open && long ? "line-clamp-6" : "")
        }
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1.5 font-mono text-[11px] uppercase tracking-wider text-primary hover:underline"
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
              <div className="flex h-full w-full items-center justify-center font-mono text-[10px] uppercase text-text-dim">
                No photo
              </div>
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] font-semibold leading-tight text-text-bright md:text-[36px]">
            {detail.name}
          </h1>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-text-muted">
            {[detail.knownForDepartment, life].filter(Boolean).join(" · ")}
          </p>
          {detail.imdbId && (
            <a
              href={`https://www.imdb.com/name/${detail.imdbId}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-[4px] border border-border px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-text-muted hover:border-border-strong hover:text-text-bright"
            >
              IMDb <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </header>

      {detail.biography && (
        <div className="mt-8 max-w-3xl">
          <Bio text={detail.biography} />
        </div>
      )}

      {/* Works grouped by role */}
      <div className="mt-10 space-y-8">
        {detail.groups.map((g) => (
          <section key={g.department}>
            <MicroLabel>
              {g.department} · {g.items.length}
            </MicroLabel>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {g.items.map((it) => (
                <MediaCard key={it.id} item={it} />
              ))}
            </div>
          </section>
        ))}
        {detail.groups.length === 0 && (
          <p className="font-mono text-[12px] text-text-dim">
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
      <TopBar />
      <Suspense fallback={<PersonLoader />}>
        <PersonFetcher id={id} />
      </Suspense>
    </div>
  );
}
