import { Suspense, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bookmark,
  Check,
  ExternalLink,
  Info,
  Play,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TopBar } from "./TopBar";
import { ShareButton } from "./ShareButton";
import { useMediaDetail } from "@/hooks/useMediaDetail";
import { useUserStatus } from "@/hooks/useUserStatus";
import type { MediaDetail as MediaDetailType } from "@/types/media";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { MediaCard } from "./MediaCard";
import { ScoreBadge } from "./ScoreBadge";
import { ScrollRail } from "./ScrollRail";
import { computeBalasaurScore } from "@/lib/score";
import { displayYear } from "@/lib/mediaFormat";
import { tmdbImage, tmdbSrcSet } from "@/lib/tmdbImage";
import { WhereToWatch } from "./WhereToWatch";
import { titleProse, normalizedSources, divergenceNote } from "@/lib/titleProse";
import { appearsInQueryOptions } from "@/hooks/useMediaDetail";
import { themeForKeyword } from "@/lib/taxonomy";
import { deriveOrigins } from "@/lib/origins";
import {
  isNotInterested,
  primaryOf,
  recordForNotInterested,
  recordForSentiment,
  recordForWant,
  recordForWatched,
  sentimentOf,
  PRIMARY_HEX,
  PRIMARY_LABEL,
  SENTIMENT_HEX,
  SENTIMENT_LABEL,
  type PrimaryKey,
  type SentimentKey,
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

// A metadata chip that links straight into the homepage grid filtered by that single
// facet — one tap opens "more like this" along that axis (genre / theme / origin).
function FacetLink({
  search,
  children,
}: {
  search: Record<string, string>;
  children: React.ReactNode;
}) {
  return (
    <Link
      to="/"
      search={search}
      className="rounded-[4px] border border-border bg-panel px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-text-muted transition-colors hover:border-primary hover:text-primary"
    >
      {children}
    </Link>
  );
}

function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-text-dim">
      {children}
    </div>
  );
}

// Two-axis status UI: pick a primary state (Want to Watch | Watched), and once
// something is Watched a sentiment row appears (Liked it / Not for me). Sentiment
// is never clobbered by re-tapping Watched. "Never show this" is the quiet escape
// hatch underneath — a hard "won't watch" that keeps the deck honest.
function StatusControls({ detail }: { detail: MediaDetailType }) {
  const { statuses, recordStatus } = useUserStatus();
  const rec = statuses[detail.id];
  const primary = primaryOf(rec);
  const sentiment = sentimentOf(rec);
  const rejected = isNotInterested(rec);

  const setPrimary = (key: PrimaryKey) => {
    if (primary === key) {
      recordStatus(detail.id, null); // tap again to clear
    } else {
      recordStatus(detail.id, key === "want" ? recordForWant() : recordForWatched(rec), detail);
    }
  };

  const setSentiment = (s: SentimentKey) => {
    recordStatus(detail.id, recordForSentiment(rec, s), detail);
  };

  const toggleNotInterested = () => {
    recordStatus(detail.id, rejected ? null : recordForNotInterested(), detail);
  };

  const primaryBtn = (key: PrimaryKey, icon: React.ReactNode) => {
    const active = primary === key;
    return (
      <button
        type="button"
        onClick={() => setPrimary(key)}
        aria-pressed={active}
        className={
          "flex items-center justify-center gap-1.5 rounded-[4px] border px-2 py-2 font-mono text-[11px] uppercase tracking-wider transition-colors " +
          (active
            ? "border-border-strong bg-background text-text-bright"
            : "border-border bg-transparent text-text-muted hover:border-border-strong hover:text-text-bright")
        }
        style={active ? { borderColor: PRIMARY_HEX[key] } : undefined}
      >
        <span style={active ? { color: PRIMARY_HEX[key] } : undefined}>{icon}</span>
        {PRIMARY_LABEL[key]}
      </button>
    );
  };

  return (
    <div className="rounded-[5px] border border-border bg-panel p-3">
      <MicroLabel>Your status</MicroLabel>
      <div className="grid grid-cols-2 gap-1.5">
        {primaryBtn("want", <Bookmark className="h-3.5 w-3.5" />)}
        {primaryBtn("watched", <Check className="h-3.5 w-3.5" />)}
      </div>

      {primary === "watched" && (
        <div className="mt-2">
          <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-text-dim">
            How was it?
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {(["liked", "disliked"] as const).map((s) => {
              const active = sentiment === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSentiment(s)}
                  aria-pressed={active}
                  className={
                    "flex items-center justify-center gap-1.5 rounded-[4px] border px-2 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors " +
                    (active
                      ? "bg-background text-text-bright"
                      : "border-border bg-transparent text-text-muted hover:border-border-strong hover:text-text-bright")
                  }
                  style={
                    active ? { borderColor: SENTIMENT_HEX[s], color: SENTIMENT_HEX[s] } : undefined
                  }
                >
                  {s === "liked" ? (
                    <ThumbsUp className="h-3 w-3" />
                  ) : (
                    <ThumbsDown className="h-3 w-3" />
                  )}
                  {SENTIMENT_LABEL[s]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={toggleNotInterested}
          aria-pressed={rejected}
          className={
            "cursor-pointer font-mono text-[11px] uppercase tracking-wider transition-colors " +
            (rejected ? "text-[#c75d6e]" : "text-text-dim hover:text-text-muted")
          }
        >
          {rejected ? "✕ Never show this (undo)" : "Never show this"}
        </button>
        {(primary || rejected) && (
          <button
            type="button"
            onClick={() => recordStatus(detail.id, null)}
            className="cursor-pointer font-mono text-[11px] uppercase tracking-wider text-text-dim hover:text-text-muted"
          >
            Clear
          </button>
        )}
      </div>
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
  // Derived from language alone (no ISO country codes available on the client-fetched
  // detail payload) — covers the distinctive, language-first buckets (Korean, Japanese,
  // Chinese, Indian, Spanish, French); English-language titles resolve to no bucket here.
  const origin = deriveOrigins(facts.originalLanguage, undefined)[0];

  // Deterministic data-prose, composed from what this database holds. See
  // src/lib/titleProse.ts for why this exists and what it is allowed to say.
  const prose = titleProse({
    mediaType: detail.mediaType,
    title: detail.title,
    year: detail.year,
    genres: detail.genres,
    origins: detail.origins,
    streaming: detail.streaming,
    runtime: detail.runtime,
    numberOfSeasons: detail.numberOfSeasons,
    numberOfEpisodes: detail.numberOfEpisodes,
    completionStatus: facts.status,
    awardWinner: detail.awardWinner,
    awardNominee: detail.awardNominee,
    voteCount: detail.voteCount,
    ratings,
    cohort: detail.context?.cohort,
    franchise: detail.context?.franchise,
  });
  const sourceBars = normalizedSources(ratings);
  const divergence = divergenceNote(ratings);

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
              fetchPriority="high"
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
                    fetchPriority="high"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center font-mono text-[11px] uppercase text-text-dim">
                    No art
                  </div>
                )}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-[28px] font-semibold leading-tight text-text-bright md:text-[40px] [text-shadow:_0_1px_3px_rgba(0,0,0,0.55)]">
                  {detail.title}
                </h1>
                <div className="mt-1 shrink-0">
                  <ShareButton title={detail.title} />
                </div>
              </div>
              {meta.length > 0 && (
                <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-text-muted">
                  {meta.join(" · ")}
                </p>
              )}
              {detail.genres.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {detail.genres.map((g) => (
                    <FacetLink key={g} search={{ genres: g }}>
                      {g}
                    </FacetLink>
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

      {/* Body. On mobile the aside comes FIRST: someone who arrived from a
          "where to watch X" search needs the answer and the save button on the
          first screen, not below eight editorial sections. On md and up it
          returns to a right sidebar. */}
      <div className="mx-auto mt-8 flex max-w-[1100px] flex-col gap-6 px-4 pb-16 md:grid md:grid-cols-[1fr_300px]">
        {/* MAIN */}
        <div className="order-2 min-w-0 space-y-6 md:order-1">
          {/* Our read first, the distributor's synopsis second. The prose is
              composed from this database (score provenance, source
              disagreement, vote weight, shape, availability), so the page
              leads with something no other site holding the same API data
              can print. */}
          {prose && (
            <section>
              <MicroLabel>The read</MicroLabel>
              <p className="text-[15px] leading-relaxed text-text-bright">{prose}</p>
            </section>
          )}

          {detail.overview && (
            <section>
              <MicroLabel>Synopsis</MicroLabel>
              <p className="text-[15px] leading-relaxed text-text">{detail.overview}</p>
            </section>
          )}

          <section>
            <MicroLabel>Ratings</MicroLabel>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(() => {
                // The unified blend, same as the card badges (per-source tiles
                // follow). Click for the breakdown — the score earns trust by
                // showing its math, and it explains why our 0–100 sits next to
                // IMDb's 0–10 and RT's %.
                const balasaur = ratings.balasaur ?? computeBalasaurScore(ratings);
                if (balasaur === undefined) return null;
                const sources: { label: string; value?: string; weight: string }[] = [
                  {
                    label: "IMDb",
                    value: ratings.imdb !== undefined ? `${ratings.imdb}/10` : undefined,
                    weight: "25%",
                  },
                  {
                    label: "Rotten Tomatoes",
                    value:
                      ratings.rottenTomatoes !== undefined
                        ? `${ratings.rottenTomatoes}%`
                        : undefined,
                    weight: "12.5%",
                  },
                  {
                    label: "Metacritic",
                    value:
                      ratings.metacritic !== undefined ? `${ratings.metacritic}/100` : undefined,
                    weight: "12.5%",
                  },
                  {
                    label: "TMDB",
                    value: ratings.tmdb !== undefined ? `${ratings.tmdb}/10` : undefined,
                    weight: "10%",
                  },
                ];
                return (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="cursor-pointer rounded-[5px] border border-border bg-panel px-3 py-2.5 text-left transition-colors hover:border-border-strong"
                      >
                        <div className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-text-dim">
                          Balasaur Score
                          <Info className="h-2.5 w-2.5" aria-hidden="true" />
                        </div>
                        <div className="mt-1">
                          <ScoreBadge score={balasaur} size="md" />
                        </div>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-72 border-border bg-panel p-3 text-foreground"
                    >
                      <p className="font-mono text-[11px] uppercase tracking-wider text-text-bright">
                        How this score works
                      </p>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-text-muted">
                        One 0–100 blend of every rating source we have, weighted by reliability and
                        renormalized when a source is missing.
                      </p>
                      <ul className="mt-2.5 space-y-1">
                        {sources.map((s) => (
                          <li
                            key={s.label}
                            className="flex items-center justify-between font-mono text-[11px]"
                          >
                            <span className={s.value ? "text-text-bright" : "text-text-dim"}>
                              {s.label}
                              <span className="ml-1.5 text-[11px] text-text-dim">{s.weight}</span>
                            </span>
                            <span className={s.value ? "text-text-bright" : "text-text-dim"}>
                              {s.value ?? "—"}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2.5 border-t border-border pt-2 text-[11px] leading-relaxed text-text-dim">
                        User ratings join the blend (at 50%) as the community grows.
                      </p>
                    </PopoverContent>
                  </Popover>
                );
              })()}
            </div>

            {/* Four sources on one 0 to 100 axis. Tiles showed four numbers in
                four different units, which hid the only thing worth seeing:
                whether the sources agree. Holding all four normalized is the
                thing a competitor mirroring the same API cannot do. */}
            {sourceBars.length > 0 ? (
              <div className="mt-3 space-y-1.5">
                {sourceBars.map((src) => (
                  <div key={src.label} className="flex items-center gap-2.5">
                    <span className="w-[104px] shrink-0 font-mono text-[11px] uppercase tracking-wider text-text-dim">
                      {src.label}
                    </span>
                    <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-border">
                      <span
                        className="block h-full rounded-full bg-rating"
                        style={{ width: `${Math.max(2, Math.min(100, src.pct))}%` }}
                      />
                    </span>
                    <span className="w-[68px] shrink-0 text-right font-mono text-[11px] text-text-bright">
                      {src.shown}
                    </span>
                  </div>
                ))}
                {divergence && (
                  <p className="pt-1.5 font-mono text-[11px] leading-relaxed text-text-muted">
                    {divergence}
                  </p>
                )}
                {typeof detail.voteCount === "number" && detail.voteCount > 0 && (
                  <p className="font-mono text-[12px] text-text-dim">
                    {detail.voteCount.toLocaleString("en-US")} audience votes
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-3 font-mono text-[11px] text-text-dim">
                No ratings available yet.
              </div>
            )}
          </section>

          {/* TV seasons are a sequence, so they get a table. Half the catalog
              is TV and this was previously not rendered at all. */}
          {detail.mediaType === "tv" && (detail.seasons?.length ?? 0) > 0 && (
            <section>
              <MicroLabel>Seasons</MicroLabel>
              <div className="overflow-hidden rounded-[5px] border border-border">
                <table className="w-full border-collapse">
                  <tbody>
                    {detail
                      .seasons!.filter((sn) => sn.seasonNumber > 0)
                      .map((sn) => (
                        <tr
                          key={sn.seasonNumber}
                          className="border-b border-border last:border-b-0"
                        >
                          <td className="px-3 py-2 font-mono text-[11px] text-text-dim">
                            {sn.seasonNumber}
                          </td>
                          <td className="min-w-0 px-1 py-2 text-[13px] text-text-bright">
                            <span className="block truncate">{sn.name}</span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[11px] text-text-muted">
                            {sn.episodeCount > 0 && `${sn.episodeCount} ep`}
                            {sn.airDate && (
                              <span className="ml-2 text-text-dim">{sn.airDate.slice(0, 4)}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

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
                {detail.keywords.map((k) => {
                  const theme = themeForKeyword(k);
                  // Only keywords that map to a real theme facet are clickable — an
                  // unrecognized raw keyword has nothing to filter into, so it stays plain.
                  return theme ? (
                    <FacetLink key={k} search={{ themes: theme }}>
                      {k}
                    </FacetLink>
                  ) : (
                    <span
                      key={k}
                      className="rounded-[4px] border border-border bg-panel px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-text-dim"
                    >
                      {k}
                    </span>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* SIDE */}
        <aside className="order-1 space-y-4 md:order-2">
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
              {origin && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="uppercase tracking-wider text-text-dim">Origin</dt>
                  <dd>
                    <FacetLink search={{ origins: origin }}>{origin}</FacetLink>
                  </dd>
                </div>
              )}
              {/* Production countries and companies were removed: they
                  duplicated Origin and changed nothing a viewer decides.
                  Status only earns its row while a title is unreleased. */}
              {facts.status && facts.status !== "Released" && facts.status !== "Ended" && (
                <FactRow k="Status" v={facts.status} />
              )}
              {facts.releaseDate && <FactRow k="Released" v={facts.releaseDate} />}
            </dl>
          </div>

          <AppearsIn mediaId={detail.id} />

          {(external.imdbId || external.homepage) && (
            <div className="rounded-[5px] border border-border bg-panel p-3">
              <MicroLabel>Links</MicroLabel>
              <ul className="space-y-1.5">
                {external.imdbId && (
                  <LinkRow href={`https://www.imdb.com/title/${external.imdbId}/`} label="IMDb" />
                )}
                {external.homepage && <LinkRow href={external.homepage} label="Official site" />}
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

// Collections this title ranks in — links the detail page into the /best/*
// shelf network. Fail-soft: nothing renders while loading, on error, or when
// the title hasn't earned a shelf spot.
function AppearsIn({ mediaId }: { mediaId: string }) {
  const { data } = useQuery(appearsInQueryOptions(mediaId));
  if (!data || data.length === 0) return null;
  return (
    <div className="rounded-[5px] border border-border bg-panel p-3">
      <MicroLabel>Appears in</MicroLabel>
      <ul className="space-y-1.5">
        {data.map((c) => (
          <li key={c.slug}>
            <Link
              to="/best/$slug"
              params={{ slug: c.slug }}
              className="flex items-baseline justify-between gap-3 font-mono text-[11px] text-text-muted hover:text-primary"
            >
              <span className="truncate">{c.title}</span>
              <span className="shrink-0 text-text-dim">#{c.rank}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
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
  // Overlaid on the hero banner (absolute, below the top bar) instead of
  // occupying its own row — the old placement burned a full-width band of
  // vertical space just for one small button. Glassy treatment keeps it legible
  // over any backdrop.
  return (
    <div className="pointer-events-none absolute inset-x-0 top-12 z-20">
      <div className="mx-auto max-w-[1100px] px-4 pt-4">
        <button
          type="button"
          onClick={goBack}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-[5px] border border-white/20 bg-background/60 px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-text-bright backdrop-blur-md transition-colors hover:border-primary hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to browse
        </button>
      </div>
    </div>
  );
}

export function MediaDetail({ mediaType, id }: { mediaType: "movie" | "tv"; id: string }) {
  return (
    <div className="relative min-h-screen bg-background">
      <TopBar />
      <BackBar />
      <Suspense fallback={<DetailLoader />}>
        <DetailFetcher type={mediaType} id={id} />
      </Suspense>
    </div>
  );
}
