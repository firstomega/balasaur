import { Suspense, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, Play } from "lucide-react";
import { TopBar } from "./TopBar";
import { useMediaDetail } from "@/hooks/useMediaDetail";
import { useUserStatus } from "@/hooks/useUserStatus";
import type { MediaDetail as MediaDetailType } from "@/types/media";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { MediaCard } from "./MediaCard";
import { ScrollRail } from "./ScrollRail";
import { displayYear } from "@/lib/mediaFormat";
import { tmdbImage, tmdbSrcSet } from "@/lib/tmdbImage";
import { WhereToWatch } from "./WhereToWatch";
import {
  recordForStatus,
  STATUS_HEX,
  STATUS_LABEL,
  STATUS_ORDER,
  statusKeyOf,
  type StatusKey,
} from "@/lib/userStatus";

function fmtMoney(n?: number) {
  if (!n) return undefined;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

// ISO-639-1 code → full English language name ("en" → "English"). Falls back to
// the upper-cased code for anything Intl can't resolve.
let langNames: Intl.DisplayNames | null = null;
function languageName(code?: string): string {
  if (!code) return "";
  try {
    langNames ??= new Intl.DisplayNames(["en"], { type: "language" });
    return langNames.of(code.toLowerCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

function fmtRuntime(min?: number) {
  if (!min) return undefined;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function PersonName({ name, personId }: { name: string; personId?: number }) {
  if (personId) {
    return (
      <Link
        to="/person/$id"
        params={{ id: String(personId) }}
        className="truncate text-text-bright hover:text-primary"
      >
        {name}
      </Link>
    );
  }
  return <span className="truncate text-text-bright">{name}</span>;
}

function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-text-dim">
      {children}
    </div>
  );
}

function RatingTile({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return (
    <div className="rounded-[5px] border border-border bg-panel px-3 py-2.5">
      <div className="font-mono text-[9.5px] uppercase tracking-wider text-text-dim">{label}</div>
      <div className="mt-1 font-mono text-[18px] text-text-bright">
        {value}
        <span className="ml-0.5 text-[11px] text-text-muted">{suffix}</span>
      </div>
    </div>
  );
}

function StatusControls({ detail }: { detail: MediaDetailType }) {
  const { statuses, recordStatus } = useUserStatus();
  const current = statusKeyOf(statuses[detail.id]);

  const onPick = (key: StatusKey) => {
    if (current === key) {
      recordStatus(detail.id, null);
    } else {
      recordStatus(detail.id, recordForStatus(key), detail);
    }
  };

  return (
    <div className="rounded-[5px] border border-border bg-panel p-3">
      <MicroLabel>Your status</MicroLabel>
      <div className="grid grid-cols-2 gap-1.5">
        {STATUS_ORDER.map((k) => {
          const active = current === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onPick(k)}
              className={
                "flex items-center gap-1.5 rounded-[4px] border px-2 py-1.5 font-mono text-[10.5px] uppercase tracking-wider transition-colors " +
                (active
                  ? "border-border-strong bg-background text-text-bright"
                  : "border-border bg-transparent text-text-muted hover:border-border-strong hover:text-text-bright")
              }
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: STATUS_HEX[k] }}
              />
              {STATUS_LABEL[k]}
            </button>
          );
        })}
      </div>
      {current && (
        <button
          type="button"
          onClick={() => recordStatus(detail.id, null)}
          className="mt-2 w-full rounded-[4px] border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-text-dim hover:border-border-strong hover:text-text-muted"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function DetailInner({ detail }: { detail: MediaDetailType }) {
  const { ratings, facts, external } = detail;
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const typeLabel = detail.mediaType === "movie" ? "Movie" : "TV";
  const length =
    detail.mediaType === "movie"
      ? fmtRuntime(detail.runtime)
      : detail.numberOfSeasons
        ? `${detail.numberOfSeasons} season${detail.numberOfSeasons === 1 ? "" : "s"}${
            detail.numberOfEpisodes
              ? ` · ${detail.numberOfEpisodes} episode${detail.numberOfEpisodes === 1 ? "" : "s"}`
              : ""
          }`
        : undefined;

  const meta = [displayYear(detail), typeLabel, length, detail.certification].filter(Boolean);

  return (
    <article>
      {/* Hero */}
      <header className="relative">
        <div className="absolute inset-x-0 top-0 h-[300px] overflow-hidden bg-panel md:h-[440px]">
          {detail.backdropUrl && (
            <img
              src={tmdbImage(detail.backdropUrl, "w1280")}
              srcSet={tmdbSrcSet(detail.backdropUrl, [
                { w: 780, size: "w780" },
                { w: 1280, size: "w1280" },
              ])}
              sizes="100vw"
              alt=""
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover opacity-50"
            />
          )}
          {/* Scrim: darkens the lower half (where the title sits) so it stays
              legible over any backdrop, bright or dark. */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/30" />
        </div>

        <div className="relative z-10 mx-auto max-w-[1100px] px-4 pt-[168px] md:pt-[260px]">
          <div className="flex flex-col gap-5 md:flex-row md:items-end">
            <div className="w-[160px] shrink-0 overflow-hidden rounded-[8px] border border-border bg-panel shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)] md:w-[220px]">
              <div className="aspect-[2/3] w-full">
                {detail.posterUrl ? (
                  <img
                    src={tmdbImage(detail.posterUrl, "w342")}
                    srcSet={tmdbSrcSet(detail.posterUrl, [
                      { w: 342, size: "w342" },
                      { w: 500, size: "w500" },
                    ])}
                    sizes="(max-width: 768px) 160px, 220px"
                    alt={detail.title}
                    width={342}
                    height={513}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center font-mono text-[10px] uppercase text-text-dim">
                    No art
                  </div>
                )}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-[28px] font-semibold leading-tight text-text-bright md:text-[40px] [text-shadow:_0_1px_3px_rgba(0,0,0,0.55)]">
                {detail.title}
              </h1>
              {meta.length > 0 && (
                <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-text-muted">
                  {meta.join(" · ")}
                </p>
              )}
              {detail.genres.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {detail.genres.map((g) => (
                    <span
                      key={g}
                      className="rounded-[4px] border border-border bg-panel px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-muted"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}
              {detail.tagline && (
                <p className="mt-3 max-w-2xl text-[14px] italic text-text-muted">
                  "{detail.tagline}"
                </p>
              )}
              {detail.trailer && (
                <button
                  type="button"
                  onClick={() => setTrailerOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-[5px] border border-border-strong bg-panel px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-text-bright transition-colors hover:bg-background"
                >
                  <Play className="h-3.5 w-3.5" />
                  Watch trailer
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="mx-auto mt-8 grid max-w-[1100px] gap-6 px-4 pb-16 md:grid-cols-[1fr_300px]">
        {/* MAIN */}
        <div className="min-w-0 space-y-6">
          {detail.overview && (
            <section>
              <MicroLabel>Overview</MicroLabel>
              <p className="text-[14.5px] leading-relaxed text-text-bright">{detail.overview}</p>
            </section>
          )}

          <section>
            <MicroLabel>Ratings</MicroLabel>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ratings.imdb !== undefined && (
                <RatingTile label="IMDb" value={ratings.imdb} suffix="/10" />
              )}
              {ratings.rottenTomatoes !== undefined && (
                <RatingTile label="Rotten Tomatoes" value={ratings.rottenTomatoes} suffix="%" />
              )}
              {ratings.metacritic !== undefined && (
                <RatingTile label="Metacritic" value={ratings.metacritic} suffix="/100" />
              )}
              {ratings.tmdb !== undefined && ratings.imdb === undefined && (
                <RatingTile label="TMDB" value={ratings.tmdb} suffix="/10" />
              )}
              {!ratings.imdb && !ratings.rottenTomatoes && !ratings.metacritic && !ratings.tmdb && (
                <div className="col-span-full font-mono text-[11px] text-text-dim">
                  No ratings available yet.
                </div>
              )}
            </div>
          </section>

          {detail.crew.length > 0 && (
            <section>
              <MicroLabel>Key crew</MicroLabel>
              <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {detail.crew.map((p, i) => (
                  <li key={`${p.name}-${p.role}-${i}`} className="flex justify-between text-[13px]">
                    <PersonName name={p.name} personId={p.personId} />
                    <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
                      {p.role}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {detail.cast.length > 0 && (
            <section>
              <MicroLabel>Cast</MicroLabel>
              <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {detail.cast.map((p, i) => (
                  <li key={`${p.name}-${i}`} className="flex justify-between gap-3 text-[13px]">
                    <PersonName name={p.name} personId={p.personId} />
                    <span className="truncate font-mono text-[11px] text-text-muted">{p.role}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {detail.images && detail.images.length > 0 && (
            <section>
              <MicroLabel>Stills</MicroLabel>
              <ScrollRail className="snap-x snap-mandatory gap-2">
                {detail.images.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setLightboxIdx(i)}
                    className="group relative h-[140px] shrink-0 snap-start overflow-hidden rounded-[6px] border border-border bg-panel md:h-[170px]"
                    aria-label={`Open still ${i + 1}`}
                  >
                    <img
                      src={tmdbImage(src, "w500")}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-auto object-cover transition-opacity group-hover:opacity-90"
                    />
                  </button>
                ))}
              </ScrollRail>
            </section>
          )}

          {detail.related && detail.related.length > 0 && (
            <section>
              <MicroLabel>
                {detail.mediaType === "tv" ? "Shows" : "Movies"} like {detail.title}
              </MicroLabel>
              <ScrollRail className="gap-3">
                {detail.related.map((it) => (
                  <div key={it.id} className="w-[118px] shrink-0 md:w-[132px]">
                    <MediaCard item={it} />
                  </div>
                ))}
              </ScrollRail>
            </section>
          )}

          {detail.relatedCross && detail.relatedCross.length > 0 && (
            <section>
              <MicroLabel>
                {detail.mediaType === "tv" ? "Movies" : "Shows"} like {detail.title}
              </MicroLabel>
              <ScrollRail className="gap-3">
                {detail.relatedCross.map((it) => (
                  <div key={it.id} className="w-[118px] shrink-0 md:w-[132px]">
                    <MediaCard item={it} />
                  </div>
                ))}
              </ScrollRail>
            </section>
          )}

          {detail.keywords && detail.keywords.length > 0 && (
            <section>
              <MicroLabel>Themes</MicroLabel>
              <div className="flex flex-wrap gap-1.5">
                {detail.keywords.map((k) => (
                  <span
                    key={k}
                    className="rounded-[4px] border border-border bg-panel px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-muted"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* SIDE */}
        <aside className="space-y-4">
          <StatusControls detail={detail} />

          <WhereToWatch detail={detail} />

          <div className="rounded-[5px] border border-border bg-panel p-3">
            <MicroLabel>Facts</MicroLabel>
            <dl className="space-y-1.5 font-mono text-[11px]">
              {fmtMoney(facts.budget) && <FactRow k="Budget" v={fmtMoney(facts.budget)!} />}
              {fmtMoney(facts.revenue) && <FactRow k="Box office" v={fmtMoney(facts.revenue)!} />}
              {facts.originalLanguage && (
                <FactRow k="Language" v={languageName(facts.originalLanguage)} />
              )}
              {facts.productionCountries && facts.productionCountries.length > 0 && (
                <FactRow k="Countries" v={facts.productionCountries.slice(0, 3).join(", ")} />
              )}
              {facts.productionCompanies && facts.productionCompanies.length > 0 && (
                <FactRow k="Companies" v={facts.productionCompanies.slice(0, 3).join(", ")} />
              )}
              {facts.status && <FactRow k="Status" v={facts.status} />}
              {facts.releaseDate && <FactRow k="Released" v={facts.releaseDate} />}
            </dl>
          </div>

          {(external.imdbId || external.homepage || external.wikidataId) && (
            <div className="rounded-[5px] border border-border bg-panel p-3">
              <MicroLabel>Links</MicroLabel>
              <ul className="space-y-1.5">
                {external.imdbId && (
                  <LinkRow href={`https://www.imdb.com/title/${external.imdbId}/`} label="IMDb" />
                )}
                {external.homepage && <LinkRow href={external.homepage} label="Official site" />}
                {external.wikidataId && (
                  <LinkRow
                    href={`https://www.wikidata.org/wiki/${external.wikidataId}`}
                    label="Wikidata"
                  />
                )}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {/* Trailer dialog: iframe only mounted on open */}
      {detail.trailer && (
        <Dialog open={trailerOpen} onOpenChange={setTrailerOpen}>
          <DialogContent className="max-w-[960px] border-border bg-panel p-0">
            <DialogTitle className="sr-only">{detail.trailer.name}</DialogTitle>
            <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-[6px] bg-black">
              {trailerOpen && (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${detail.trailer.key}?autoplay=1&rel=0`}
                  title={detail.trailer.name}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full border-0"
                />
              )}
            </AspectRatio>
          </DialogContent>
        </Dialog>
      )}

      {/* Lightbox */}
      {detail.images && detail.images.length > 0 && (
        <Dialog open={lightboxIdx !== null} onOpenChange={(o) => !o && setLightboxIdx(null)}>
          <DialogContent className="max-w-[1200px] border-border bg-panel p-0">
            <DialogTitle className="sr-only">Still image</DialogTitle>
            {lightboxIdx !== null && (
              <img
                src={(detail.imagesOriginal ?? detail.images)[lightboxIdx]}
                alt=""
                decoding="async"
                className="h-auto w-full rounded-[6px] object-contain"
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </article>
  );
}

function FactRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="uppercase tracking-wider text-text-dim">{k}</dt>
      <dd className="truncate text-text-bright">{v}</dd>
    </div>
  );
}

function LinkRow({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between rounded-[4px] border border-border px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-text-muted hover:border-border-strong hover:text-text-bright"
      >
        <span>{label}</span>
        <ExternalLink className="h-3 w-3" />
      </a>
    </li>
  );
}

function DetailLoader() {
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8">
      <div className="h-[300px] animate-pulse rounded-[8px] bg-panel md:h-[440px]" />
      <div className="mt-6 h-8 w-2/3 animate-pulse rounded bg-panel" />
      <div className="mt-3 h-4 w-1/3 animate-pulse rounded bg-panel" />
    </div>
  );
}

function DetailFetcher({ type, id }: { type: "movie" | "tv"; id: string }) {
  const { data } = useMediaDetail(type, id);
  return <DetailInner detail={data} />;
}

function BackBar() {
  const router = useRouter();
  const goBack = () => {
    // Prefer a true browser-back so the filtered grid + scroll position are
    // restored; fall back to the homepage (which restores filters from storage).
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      router.navigate({ to: "/" });
    }
  };
  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-3">
      <button
        type="button"
        onClick={goBack}
        className="inline-flex items-center gap-1.5 rounded-[5px] border border-border bg-panel px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-text-muted hover:border-primary hover:text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to browse
      </button>
    </div>
  );
}

export function MediaDetail({ mediaType, id }: { mediaType: "movie" | "tv"; id: string }) {
  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <BackBar />
      <Suspense fallback={<DetailLoader />}>
        <DetailFetcher type={mediaType} id={id} />
      </Suspense>
    </div>
  );
}
