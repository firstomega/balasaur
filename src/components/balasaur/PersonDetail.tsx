import { Fragment, Suspense, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { MediaCard } from "./MediaCard";
import { ListTile } from "./ListTile";
import { ScoreBadge } from "./ScoreBadge";
import { usePersonDetail } from "@/hooks/usePersonDetail";
import type { MediaItem, PersonDetail as PersonDetailType } from "@/types/media";
import { tmdbImage, tmdbSrcSet } from "@/lib/tmdbImage";
import { personProse } from "@/lib/personProse";
import { decadeRuns, personListLead } from "@/lib/personPage";
import { paintTiles } from "@/lib/paintWall";
import { swatchSurface } from "@/lib/swatchSurface";
import { swatchTint } from "@/lib/swatchTint";
import { trustedScore } from "@/lib/trust";
import { mediaSlug } from "@/lib/slug";
import { cn } from "@/lib/utils";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 font-display text-2xl font-extrabold leading-none text-text-bright md:text-3xl">
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

/** A long name steps down one size. Decided from its length, so the HTML is
 *  the same at every width. */
function nameSize(name: string): string {
  return name.length > 22 ? "text-4xl md:text-[64px]" : "text-[48px] md:text-[88px]";
}

/** Collapsed to three lines: TMDB's biography is the same text every other
 *  site carries, so it sits below the ranking and opens on request. */
function Bio({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 240;
  return (
    <section>
      <SectionHeading>Biography</SectionHeading>
      <p
        className={
          "whitespace-pre-line text-lg leading-relaxed text-text-bright " +
          (!open && long ? "line-clamp-3" : "")
        }
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1.5 text-base font-bold text-text-bright underline underline-offset-2"
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </section>
  );
}

/** The meta line of a filmography row: what kind of title it is, and its
 *  genres where the catalog has them. */
function rowMeta(item: MediaItem): string[] {
  const bits: string[] = [];
  const seasons = item.mediaType === "tv" ? (item.seasonCount ?? item.seasons?.length ?? 0) : 0;
  bits.push(item.mediaType === "tv" ? "TV" : "Movie");
  if (seasons > 0) bits.push(`${seasons} Season${seasons === 1 ? "" : "s"}`);
  bits.push(...item.genres.slice(0, 2));
  return bits;
}

/**
 * One credit on the timeline: the year in a cell painted with the poster's
 * swatch, the poster, the title and a meta line, and the score sticker when
 * the score is trusted. The row behind the text is the swatch tinted light,
 * so the text stays ink. A title with no swatch gets the same row on paper.
 */
function CreditRow({ item }: { item: MediaItem }) {
  const rawId = item.id.replace(/^(movie|tv)-/, "");
  // An id-less item renders no link: an empty param leaves "/tv/$id" in the href.
  const isLinkable = (item.mediaType === "movie" || item.mediaType === "tv") && /^\d+$/.test(rawId);
  const to = item.mediaType === "movie" ? "/movie/$id" : "/tv/$id";
  const score = trustedScore(item);
  const sw = item.swatch ?? null;
  const meta = rowMeta(item);

  const body = (
    <>
      <span className="block h-[60px] w-10 shrink-0 overflow-hidden rounded-md bg-current/10 md:h-[72px] md:w-12">
        {item.posterUrl && (
          <img
            src={tmdbImage(item.posterUrl, "w92")}
            srcSet={tmdbSrcSet(item.posterUrl, [
              { w: 92, size: "w92" },
              { w: 154, size: "w154" },
            ])}
            sizes="48px"
            alt=""
            width={48}
            height={72}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        )}
      </span>
      <span className="min-w-0">
        <h3 className="line-clamp-2 text-lg font-bold leading-tight text-text-bright group-hover:underline">
          {item.title}
        </h3>
        <p className="mt-0.5 text-sm text-text-muted md:text-base">
          {/* The dot travels with the bit after it, so a wrap never strands a
              separator or splits "2 Seasons". */}
          {meta.map((bit, i) => (
            <Fragment key={i}>
              {i > 0 && " "}
              <span className="whitespace-nowrap">
                {i > 0 && "· "}
                {bit}
              </span>
            </Fragment>
          ))}
        </p>
      </span>
    </>
  );

  return (
    <li className={cn("flex items-stretch overflow-hidden rounded-xl", swatchTint(sw))}>
      <span
        className={cn(
          "flex w-14 shrink-0 items-center justify-center font-display text-xl font-extrabold tabular-nums leading-none md:w-20 md:text-2xl",
          sw ? swatchSurface(sw) : "bg-secondary text-text-bright",
        )}
      >
        {item.year}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2.5 pr-2.5 md:gap-4 md:pl-4 md:pr-4">
        {isLinkable ? (
          <Link
            to={to}
            params={{ id: mediaSlug(rawId, item.title) }}
            className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg md:gap-4"
          >
            {body}
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2.5 md:gap-4">{body}</div>
        )}
        {typeof score === "number" && <ScoreBadge score={score} />}
      </div>
    </li>
  );
}

function PersonInner({ detail }: { detail: PersonDetailType }) {
  const life = lifeLine(detail);
  const facts = [detail.knownForDepartment, life].filter(Boolean).join(" · ");
  const prose = detail.catalog ? personProse(detail.name, detail.catalog) : "";
  const top = detail.catalog?.top ?? [];
  // The band takes the colour of the best-scored credit, the first card below
  // it, so the colour can be explained from the page.
  const band = top[0]?.swatch ?? null;
  const lists = (detail.lists ?? []).map((l) => ({
    list: l,
    lead: personListLead(l, detail.groups),
  }));
  const listPaint = paintTiles(lists.map((l) => l.lead));

  return (
    <article className="pb-16">
      {/* The band is painted in the swatch with that swatch's ink, which every
          pair holds at 4.5:1 (src/lib/palette.test.ts). No swatch, paper. */}
      <header className={swatchSurface(band)}>
        <div className="mx-auto flex max-w-content flex-col gap-5 px-4 py-6 sm:flex-row sm:items-center md:gap-10 md:py-12">
          <div className="h-28 w-28 shrink-0 overflow-hidden rounded-full border-4 border-current bg-current/10 md:h-52 md:w-52 md:border-[6px]">
            {detail.profileUrl ? (
              <img
                src={tmdbImage(detail.profileUrl, "w342")}
                alt={detail.name}
                width={342}
                height={513}
                decoding="async"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-semibold">
                No photo
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1
              className={cn(
                "text-balance break-words font-display font-extrabold leading-[0.95]",
                nameSize(detail.name),
              )}
            >
              {detail.name}
            </h1>
            {facts && <p className="mt-3 text-lg font-semibold tabular-nums">{facts}</p>}
            {detail.imdbId && (
              <a
                href={`https://www.imdb.com/name/${detail.imdbId}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 rounded-full border-2 border-current px-3.5 py-1.5 text-base font-bold"
              >
                IMDb <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-content px-4">
        {/* The ranked opener, first thing under the name. Ordered by the
            Balasaur Score printed on each poster, so a stranger can check the
            order against the page. The server returns nothing here when the
            pool is too small for an order to carry a claim, and then the page
            opens on the filmography instead. */}
        {top.length > 0 && (
          <section className="mt-8 md:mt-12">
            <SectionHeading>Highest rated</SectionHeading>
            <div className="grid grid-cols-2 gap-x-2.5 gap-y-3 sm:grid-cols-3 md:grid-cols-6 md:gap-x-3.5">
              {top.map((it, i) => (
                <MediaCard
                  key={it.id}
                  item={it}
                  eager={i < 6}
                  posterOverlay={
                    // A chip, not a numeral on the bare poster: white type
                    // with a shadow vanished on bright posters.
                    <span
                      aria-hidden="true"
                      className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-text-bright px-1.5 font-mono text-base font-bold tabular-nums leading-none text-background"
                    >
                      {i + 1}
                    </span>
                  }
                />
              ))}
            </div>
          </section>
        )}

        {/* The best-decade comparison, drawn from the same pool as the six. */}
        {prose && (
          <p className="mt-6 max-w-article font-display text-2xl font-bold leading-tight text-text-bright md:text-3xl">
            {prose}
          </p>
        )}

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-14">
          {(lists.length > 0 || detail.biography) && (
            <aside className="flex flex-col gap-8 lg:col-start-2 lg:row-start-1">
              {/* The /best list for this person, which links back here. */}
              {lists.length > 0 && (
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
                  {lists.map(({ list, lead }, i) => (
                    <ListTile
                      key={list.slug}
                      slug={list.slug}
                      title={list.title}
                      itemCount={list.itemCount}
                      lead={lead}
                      swatch={listPaint[i]}
                    />
                  ))}
                </div>
              )}
              {detail.biography && <Bio text={detail.biography} />}
            </aside>
          )}

          {/* Works grouped by role, each a timeline, newest first: the order
              someone looking up a filmography expects to find it in. */}
          <div className="min-w-0 space-y-10 lg:col-start-1 lg:row-start-1">
            {detail.groups.map((g) => (
              <section key={g.department}>
                <SectionHeading>
                  {g.department}{" "}
                  <span className="font-mono text-lg font-semibold tabular-nums text-text-muted">
                    {g.items.length}
                  </span>
                </SectionHeading>
                <div className="space-y-4">
                  {decadeRuns(g.items).map((run) => (
                    <div key={run.decade ?? "undated"}>
                      <p className="mb-1.5 font-display text-lg font-extrabold leading-none text-text-muted">
                        {run.decade ?? "No release date"}
                      </p>
                      <ol className="flex flex-col gap-1.5">
                        {run.items.map((it) => (
                          <CreditRow key={it.id} item={it} />
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {detail.groups.length === 0 && (
              <p className="text-lg text-text-muted">
                No catalogued movies or TV for this person yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function PersonLoader() {
  return (
    <div className="bg-panel">
      <div className="mx-auto flex max-w-content gap-5 px-4 py-6 md:py-12">
        <div className="h-28 w-28 shrink-0 animate-pulse rounded-full bg-secondary md:h-52 md:w-52" />
        <div className="flex-1 space-y-3 pt-2">
          <div className="h-10 w-2/3 animate-pulse rounded-lg bg-secondary" />
          <div className="h-4 w-1/3 animate-pulse rounded-lg bg-secondary" />
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
