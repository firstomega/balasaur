import { Fragment, Suspense, useState } from "react";
import { Link, useCanGoBack, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bookmark, Check, ExternalLink, Play, ThumbsDown, ThumbsUp } from "lucide-react";
import { ShareButton } from "./ShareButton";
import { useMediaDetail } from "@/hooks/useMediaDetail";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useQuickAction } from "@/hooks/useQuickAction";
import { useHydrated } from "@/hooks/useHydrated";
import type { MediaDetail as MediaDetailType } from "@/types/media";
import type { EpisodeRating } from "@/lib/episodes";
import type { SwatchKey } from "@/lib/posterSwatch";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { MediaCard } from "./MediaCard";
import { EpisodeHeatmap } from "./EpisodeHeatmap";
import { ScoreBadge } from "./ScoreBadge";
import { ScrollRail } from "./ScrollRail";
import { ListTile } from "./ListTile";
import { isRankable, trustedScore } from "@/lib/trust";
import { displayYear, longDate } from "@/lib/mediaFormat";
import { tmdbImage, tmdbSrcSet } from "@/lib/tmdbImage";
import { WhereToWatch } from "./WhereToWatch";
import { titleProse, runtimeLabel } from "@/lib/titleProse";
import { sourceRows } from "@/lib/scoreTable";
import { appearsInQueryOptions } from "@/hooks/useMediaDetail";
import { themeForKeyword } from "@/lib/taxonomy";
import { deriveOrigins } from "@/lib/origins";
import { paintTiles } from "@/lib/paintWall";
import { swatchSurface } from "@/lib/swatchSurface";
import { cn } from "@/lib/utils";
import {
  isNotInterested,
  primaryOf,
  recordForNotInterested,
  recordForSentiment,
  sentimentOf,
  PRIMARY_COLOR,
  PRIMARY_LABEL,
  SENTIMENT_COLOR,
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

function PersonName({ name, personId }: { name: string; personId?: number }) {
  if (personId) {
    return (
      <Link
        to="/person/$id"
        params={{ id: String(personId) }}
        className="truncate font-semibold text-text-bright underline-offset-2 hover:underline"
      >
        {name}
      </Link>
    );
  }
  return <span className="truncate font-semibold text-text-bright">{name}</span>;
}

// A metadata chip that links straight into the homepage grid filtered by that
// single facet (genre, theme, origin). In the painted hero it is outlined in
// the band's own ink; on the white body it is a resting wash chip.
function FacetLink({
  search,
  children,
  onBand,
}: {
  search: Record<string, string>;
  children: React.ReactNode;
  onBand?: boolean;
}) {
  return (
    <Link
      to="/"
      search={search}
      className={cn(
        "rounded-full px-2.5 py-0.5 text-sm font-semibold transition-colors",
        onBand
          ? "border-2 border-current hover:bg-background hover:text-text-bright"
          : "border border-border bg-panel text-text-muted hover:border-border-strong hover:text-text-bright",
      )}
    >
      {children}
    </Link>
  );
}

// Section headings are plain labels in the condensed display face.
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 font-display text-2xl font-extrabold leading-none text-text-bright md:text-3xl">
      {children}
    </h2>
  );
}

// The same voice one step down, for the 300px sidebar panels.
function PanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2.5 font-display text-xl font-extrabold leading-none text-text-bright">
      {children}
    </h2>
  );
}

const PANEL = "rounded-xl bg-panel p-4";

// Two-axis status UI: pick a primary state (Watchlist | Seen), and once
// something is Seen a sentiment row appears (Loved / Not for me). Sentiment is
// never clobbered by re-tapping Seen. "Hide" is the quiet escape hatch
// underneath, a hard "won't watch" that keeps the deck honest.
function StatusControls({ detail }: { detail: MediaDetailType }) {
  const { statuses, recordStatus } = useUserStatus();
  const rec = statuses[detail.id];
  const primary = primaryOf(rec);
  const sentiment = sentimentOf(rec);
  const rejected = isNotInterested(rec);
  // The cards' handler, so a save here confirms itself with the same toast
  // and View button. A second tap clears, with the matching removal toast.
  const quickAction = useQuickAction(statuses, recordStatus);
  const setPrimary = (key: PrimaryKey) => quickAction(detail, key);

  const setSentiment = (s: SentimentKey) => {
    recordStatus(detail.id, recordForSentiment(rec, s), detail);
  };

  const toggleNotInterested = () => {
    recordStatus(detail.id, rejected ? null : recordForNotInterested(), detail);
  };

  const pill =
    "flex items-center justify-center gap-1.5 rounded-full border-2 px-2 py-2 text-base font-bold transition-colors";

  const primaryBtn = (key: PrimaryKey, icon: React.ReactNode) => {
    const active = primary === key;
    return (
      <button
        type="button"
        onClick={() => setPrimary(key)}
        aria-pressed={active}
        className={cn(
          pill,
          active
            ? "bg-background text-text-bright"
            : "border-border-strong bg-background text-text-muted hover:border-primary hover:text-text-bright",
        )}
        style={active ? { borderColor: PRIMARY_COLOR[key] } : undefined}
      >
        <span style={active ? { color: PRIMARY_COLOR[key] } : undefined}>{icon}</span>
        {PRIMARY_LABEL[key]}
      </button>
    );
  };

  return (
    <div className={PANEL}>
      <PanelHeading>Your status</PanelHeading>
      <div className="grid grid-cols-2 gap-2">
        {primaryBtn("want", <Bookmark className="h-3.5 w-3.5" />)}
        {primaryBtn("watched", <Check className="h-3.5 w-3.5" />)}
      </div>

      {primary === "watched" && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(["liked", "disliked"] as const).map((s) => {
            const active = sentiment === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSentiment(s)}
                aria-pressed={active}
                className={cn(
                  pill,
                  "py-1.5",
                  active
                    ? "bg-background"
                    : "border-border-strong bg-background text-text-muted hover:border-primary hover:text-text-bright",
                )}
                style={
                  active
                    ? { borderColor: SENTIMENT_COLOR[s], color: SENTIMENT_COLOR[s] }
                    : undefined
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
      )}

      <div className="mt-2.5 flex items-center justify-between">
        <button
          type="button"
          onClick={toggleNotInterested}
          aria-pressed={rejected}
          className={cn(
            "cursor-pointer text-sm font-semibold transition-colors",
            rejected ? "text-status-never" : "text-text-dim hover:text-text-muted",
          )}
        >
          {rejected ? "Hidden (undo)" : "Hide"}
        </button>
        {(primary || rejected) && (
          <button
            type="button"
            onClick={() => recordStatus(detail.id, null)}
            className="cursor-pointer text-sm font-semibold text-text-dim hover:text-text-muted"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

// The title in the display face. A long name steps down a size so it holds
// two or three lines instead of five: decided from the title's length alone,
// so every visitor and every width gets the same HTML.
function titleSize(title: string): string {
  return title.length > 26 ? "text-3xl md:text-[56px]" : "text-4xl md:text-[80px]";
}

// Only for someone who reached this page from another page of the site. The
// browser's own history counted the search results page too, so a visitor
// from Google was offered a button that sent them back to Google. Without
// in-app history there is nothing here: the logo already goes home. A true
// back, not a link, so the filtered grid and its scroll position come back.
// Read only after hydration: a reload or a return from another site restores
// the in-app history, so the browser can know there is a back while the cached
// HTML, rendered with none, cannot. Reading it during hydration would make the
// two disagree.
function BackButton() {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const hydrated = useHydrated();
  if (!hydrated || !canGoBack) return null;
  return (
    <button
      type="button"
      onClick={() => router.history.back()}
      className="mr-auto inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border-2 border-text-bright bg-background px-3 text-base font-bold text-text-bright transition-colors duration-fast hover:bg-text-bright hover:text-background"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Back to browse
    </button>
  );
}

function DetailInner({
  detail,
  episodeRatings,
  swatch,
}: {
  detail: MediaDetailType;
  episodeRatings?: EpisodeRating[];
  swatch: SwatchKey | null;
}) {
  const { ratings, facts, external } = detail;
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const typeLabel = detail.mediaType === "movie" ? "Movie" : "TV";
  const length =
    detail.mediaType === "movie"
      ? [detail.runtime ? runtimeLabel(detail.runtime) : undefined]
      : detail.numberOfSeasons
        ? [
            `${detail.numberOfSeasons} season${detail.numberOfSeasons === 1 ? "" : "s"}`,
            detail.numberOfEpisodes
              ? `${detail.numberOfEpisodes} episode${detail.numberOfEpisodes === 1 ? "" : "s"}`
              : undefined,
          ]
        : [];

  const meta = [displayYear(detail), typeLabel, ...length, detail.certification].filter(
    (bit): bit is string => Boolean(bit),
  );
  // Derived from language alone (no ISO country codes available on the client-fetched
  // detail payload). Covers the distinctive, language-first buckets (Korean, Japanese,
  // Chinese, Indian, Spanish, French); English-language titles resolve to no bucket here.
  const origin = deriveOrigins(facts.originalLanguage, undefined)[0];

  // One blend, read three times: the hero sticker, the ratings table, and the
  // prose. Undefined when it rests on one source or a handful of votes, so the
  // sticker, the table's share column and the sentence all go together.
  const balasaur = trustedScore({ ratings, voteCount: detail.voteCount });

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
    // Strip an untrusted blend; never add one the payload did not carry.
    ratings: { ...ratings, balasaur: ratings.balasaur === undefined ? undefined : balasaur },
    franchise: detail.context?.franchise,
  });
  const rows = sourceRows(ratings, balasaur);
  const crew = mergeCrew(detail.crew);
  const showShares = rows.some((r) => r.share !== null);
  // A list position is a promise the title belongs there. One that no longer
  // passes the trust rule (one source, a handful of votes, a trailer) keeps
  // its page but loses every "#N of" claim, here and in the closing rail.
  const rankable = isRankable({
    ratings,
    voteCount: detail.voteCount,
    mediaType: detail.mediaType,
    title: detail.title,
    genres: detail.genres,
    filmLengthMinutes: detail.mediaType === "movie" ? detail.runtime : null,
  });

  const toolbar = (
    <div className="flex items-center justify-end gap-3">
      <BackButton />
      <ShareButton title={detail.title} />
    </div>
  );

  return (
    <article>
      {/* Hero. The band is painted in the poster's swatch with that swatch's
          ink, which every pair holds at 4.5:1 (src/lib/palette.test.ts). A
          title with no swatch yet gets the same band on the paper wash. */}
      <header className={swatchSurface(swatch)}>
        <div className="mx-auto max-w-content px-4 pb-8 pt-4 md:pb-12 md:pt-6">
          {detail.backdropUrl ? (
            <div className="relative aspect-video overflow-hidden rounded-xl bg-background md:aspect-auto md:h-96 md:rounded-2xl">
              <img
                src={tmdbImage(detail.backdropUrl, "w1280")}
                srcSet={tmdbSrcSet(detail.backdropUrl, [
                  { w: 780, size: "w780" },
                  { w: 1280, size: "w1280" },
                ])}
                sizes="(min-width: 1100px) 1068px, 100vw"
                alt=""
                decoding="async"
                fetchPriority="high"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-x-3 top-3 md:inset-x-4 md:top-4">{toolbar}</div>
            </div>
          ) : (
            toolbar
          )}

          <div
            className={cn(
              "flex flex-wrap items-end gap-x-4 gap-y-5 md:flex-nowrap md:gap-x-8",
              detail.backdropUrl ? "-mt-16 md:-mt-40" : "mt-6",
            )}
          >
            <div className="relative w-32 shrink-0 -rotate-2 overflow-hidden rounded-xl border-2 border-current bg-panel shadow-xl md:ml-6 md:w-60">
              <div className="aspect-[2/3] w-full">
                {detail.posterUrl ? (
                  <img
                    src={tmdbImage(detail.posterUrl, "w342")}
                    srcSet={tmdbSrcSet(detail.posterUrl, [
                      { w: 342, size: "w342" },
                      { w: 500, size: "w500" },
                    ])}
                    sizes="(max-width: 768px) 128px, 240px"
                    alt={detail.title}
                    width={342}
                    height={513}
                    fetchPriority="high"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-text-dim">
                    No art
                  </div>
                )}
              </div>
            </div>

            <div
              className={cn(
                "order-last min-w-0 basis-full md:order-none md:basis-auto md:flex-1",
                // The row is pulled 160px up into the backdrop for the poster;
                // the title must start below the image, never on it.
                detail.backdropUrl && "md:pt-44",
              )}
            >
              <h1
                className={cn(
                  "text-balance break-words font-display font-extrabold leading-[0.95]",
                  titleSize(detail.title),
                )}
              >
                {detail.title}
              </h1>
              {meta.length > 0 && (
                <p className="mt-3 text-lg font-semibold tabular-nums">
                  {/* Each bit holds together and the dot travels with the bit
                      before it, so a wrap never splits "TV-MA" or "5 seasons"
                      and never starts a line with a separator. */}
                  {meta.map((bit, i) => (
                    <Fragment key={i}>
                      <span className="whitespace-nowrap">
                        {bit}
                        {i < meta.length - 1 && " ·"}
                      </span>
                      {i < meta.length - 1 && " "}
                    </Fragment>
                  ))}
                </p>
              )}
              {detail.genres.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {detail.genres.map((g) => (
                    <FacetLink key={g} search={{ genres: g }} onBand>
                      {g}
                    </FacetLink>
                  ))}
                </div>
              )}
              {detail.trailer && (
                <button
                  type="button"
                  onClick={() => setTrailerOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-full border-2 border-current px-4 py-2 text-lg font-bold transition-colors hover:bg-background hover:text-text-bright"
                >
                  <Play className="h-3.5 w-3.5" />
                  Watch trailer
                </button>
              )}
            </div>

            {/* No score, no sticker. A title with nothing trusted to blend
                shows its sources in the table below and nothing here. */}
            {balasaur !== undefined && (
              <div className="ml-auto flex shrink-0 items-center gap-3 md:ml-0 md:pb-1">
                <ScoreBadge score={balasaur} size="lg" className="-rotate-3" />
                {/* The label answers "what is 84?" by taking the reader to
                    the sources it blends. A scroll, not a hash navigation:
                    the router would count a fragment as a page visit, and
                    the URL and the back button would change for a jump down
                    the same page. */}
                <a
                  href="#ratings"
                  onClick={(e) => {
                    // A modified click (new tab, new window) keeps its own job.
                    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    const target = document.getElementById("ratings");
                    if (!target) return;
                    e.preventDefault();
                    target.scrollIntoView({ block: "start" });
                    // Focus follows so a keyboard reader continues from the
                    // table. Focusable only until it is left: a permanent
                    // tabindex lets a click inside the table focus the whole
                    // section and the next key press ring all of it.
                    target.setAttribute("tabindex", "-1");
                    target.addEventListener("blur", () => target.removeAttribute("tabindex"), {
                      once: true,
                    });
                    target.focus({ preventScroll: true });
                  }}
                  className="rounded-sm text-base font-bold leading-tight underline decoration-2 underline-offset-4"
                >
                  Balasaur Score
                  <br />
                  out of 100
                </a>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Body. Someone who arrived from a "where to watch X" search needs the
          answer on the first screen, not below eight editorial sections, so on
          mobile that one panel is lifted above the main column. The rest of the
          sidebar (status, facts, links) has no claim on the first screen and
          follows the page instead of burying it. The aside is display:contents
          below md, which makes its panels direct flex children here so a single
          one of them can be ordered without rendering it twice. On md and up it
          is a plain right sidebar again, in source order. */}
      <div className="mx-auto mt-8 flex max-w-content flex-col gap-8 px-4 pb-16 md:mt-10 md:grid md:grid-cols-[1fr_300px] md:gap-10">
        {/* MAIN */}
        <div className="min-w-0 space-y-10">
          {/* Our read first, the distributor's synopsis second. The prose is
              composed from this database (score provenance, series rank,
              shape, availability), so the page leads with something no other
              site holding the same API data can print. */}
          {prose && (
            <section>
              <SectionHeading>The read</SectionHeading>
              <p className="text-lg leading-relaxed text-text-bright">{prose}</p>
            </section>
          )}

          {rankable && <RanksOn key={detail.id} mediaId={detail.id} />}

          {detail.overview && (
            <section>
              <SectionHeading>Synopsis</SectionHeading>
              <p className="text-lg leading-relaxed text-text">{detail.overview}</p>
            </section>
          )}

          {/* The hero label's target. The margin keeps the heading clear of
              the sticky header: two rows on a phone (bar and search, 97px),
              one from md up (57px). */}
          <section id="ratings" className="scroll-mt-28 md:scroll-mt-16">
            <SectionHeading>Ratings</SectionHeading>
            {rows.length > 0 ? (
              <table className="w-full max-w-md border-collapse text-base">
                <thead>
                  <tr className="border-b-2 border-text-bright text-left text-sm font-semibold text-text-dim">
                    <th scope="col" className="py-1.5 pr-3 font-semibold">
                      Source
                    </th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-semibold">
                      Rating
                    </th>
                    {showShares && (
                      <th scope="col" className="py-1.5 text-right font-semibold">
                        Weight
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-b border-border">
                      <th
                        scope="row"
                        className="py-2 pr-3 text-left font-semibold text-text-bright"
                      >
                        {r.label}
                      </th>
                      <td className="py-2 pr-3 text-right tabular-nums text-text-bright">
                        {r.shown}
                        {r.key === "tmdb" &&
                          typeof detail.voteCount === "number" &&
                          detail.voteCount > 0 && (
                            <span className="block text-xs text-text-dim">
                              {detail.voteCount.toLocaleString("en-US")} votes
                            </span>
                          )}
                      </td>
                      {showShares && (
                        <td className="py-2 text-right tabular-nums text-text-muted">{r.share}%</td>
                      )}
                    </tr>
                  ))}
                </tbody>
                {showShares && balasaur !== undefined && (
                  <tfoot>
                    <tr>
                      <th scope="row" className="py-2 pr-3 text-left font-bold text-text-bright">
                        Balasaur Score
                      </th>
                      <td className="py-2 pr-3 text-right font-bold tabular-nums text-text-bright">
                        {balasaur}
                      </td>
                      <td className="py-2 text-right tabular-nums text-text-muted">100%</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            ) : (
              <p className="text-base text-text-dim">No ratings available yet.</p>
            )}
          </section>

          {/* TV seasons are a sequence, so they get a table. Half the catalog
              is TV and this was previously not rendered at all. */}
          {detail.mediaType === "tv" && (detail.seasons?.length ?? 0) > 0 && (
            <section>
              <SectionHeading>Seasons</SectionHeading>
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full border-collapse">
                  <tbody>
                    {detail
                      .seasons!.filter((sn) => sn.seasonNumber > 0)
                      .map((sn) => (
                        <tr
                          key={sn.seasonNumber}
                          className="border-b border-border last:border-b-0"
                        >
                          <td className="w-10 px-3 py-2 text-sm tabular-nums text-text-dim">
                            {sn.seasonNumber}
                          </td>
                          <td className="min-w-0 px-1 py-2 text-base font-semibold text-text-bright">
                            <span className="block truncate">{sn.name}</span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums text-text-muted">
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

          {crew.length > 0 && (
            <section>
              <SectionHeading>Key crew</SectionHeading>
              <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {crew.map((p, i) => (
                  <li
                    key={`${p.name}-${i}`}
                    className="flex justify-between gap-3 border-b border-border pb-2 text-base"
                  >
                    <PersonName name={p.name} personId={p.personId} />
                    <span className="truncate text-sm text-text-dim">{p.role}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {detail.cast.length > 0 && (
            <section>
              <SectionHeading>Cast</SectionHeading>
              <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {detail.cast.map((p, i) => (
                  <li
                    key={`${p.name}-${i}`}
                    className="flex justify-between gap-3 border-b border-border pb-2 text-base"
                  >
                    <PersonName name={p.name} personId={p.personId} />
                    <span className="truncate text-sm text-text-muted">{p.role}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {episodeRatings && episodeRatings.length > 0 && (
            <EpisodeHeatmap rows={episodeRatings} seasons={detail.seasons ?? []} />
          )}

          {detail.images && detail.images.length > 0 && (
            <section>
              <SectionHeading>Stills</SectionHeading>
              <ScrollRail label="Stills">
                {detail.images.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setLightboxIdx(i)}
                    className="group relative h-36 shrink-0 overflow-hidden rounded-xl bg-panel md:h-44"
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
              <SectionHeading>
                {detail.mediaType === "tv" ? "Shows" : "Movies"} like {detail.title}
              </SectionHeading>
              <ScrollRail>
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
              <SectionHeading>
                {detail.mediaType === "tv" ? "Movies" : "Shows"} like {detail.title}
              </SectionHeading>
              <ScrollRail>
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
              <SectionHeading>Themes</SectionHeading>
              <div className="flex flex-wrap gap-1.5">
                {detail.keywords.map((k) => {
                  const theme = themeForKeyword(k);
                  // Only keywords that map to a real theme facet are clickable. An
                  // unrecognized raw keyword has nothing to filter into, so it stays plain.
                  return theme ? (
                    <FacetLink key={k} search={{ themes: theme }}>
                      {k}
                    </FacetLink>
                  ) : (
                    <span
                      key={k}
                      className="rounded-full border border-border px-2.5 py-0.5 text-sm font-semibold text-text-dim"
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
        <aside className="contents md:block md:space-y-4">
          <StatusControls detail={detail} />

          {/* empty:hidden so a title with no provider data (WhereToWatch renders
              nothing) does not leave a gap at the top of a phone screen. */}
          <div className="order-first empty:hidden">
            <WhereToWatch detail={detail} />
          </div>

          <div className={PANEL}>
            <PanelHeading>Facts</PanelHeading>
            <dl className="space-y-2 text-base">
              {fmtMoney(facts.budget) && <FactRow k="Budget" v={fmtMoney(facts.budget)!} mono />}
              {fmtMoney(facts.revenue) && (
                <FactRow k="Box office" v={fmtMoney(facts.revenue)!} mono />
              )}
              {facts.originalLanguage && (
                <FactRow k="Language" v={languageName(facts.originalLanguage)} />
              )}
              {origin && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-muted">Origin</dt>
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
              {facts.releaseDate && <FactRow k="Released" v={longDate(facts.releaseDate)} />}
            </dl>
          </div>

          {(external.imdbId || external.homepage) && (
            <div className={PANEL}>
              <PanelHeading>Links</PanelHeading>
              <ul className="space-y-2">
                {external.imdbId && (
                  <LinkRow href={`https://www.imdb.com/title/${external.imdbId}/`} label="IMDb" />
                )}
                {external.homepage && <LinkRow href={external.homepage} label="Official site" />}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {rankable && <ShelfRail mediaId={detail.id} title={detail.title} />}

      {/* Trailer dialog: iframe only mounted on open */}
      {detail.trailer && (
        <Dialog open={trailerOpen} onOpenChange={setTrailerOpen}>
          <DialogContent className="max-w-[960px] border-border bg-background p-0">
            <DialogTitle className="sr-only">{detail.trailer.name}</DialogTitle>
            <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-md bg-black">
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
          <DialogContent className="max-w-[1200px] border-border bg-background p-0">
            <DialogTitle className="sr-only">Still image</DialogTitle>
            {lightboxIdx !== null && (
              <img
                src={(detail.imagesOriginal ?? detail.images)[lightboxIdx]}
                alt=""
                decoding="async"
                className="h-auto w-full rounded-md object-contain"
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </article>
  );
}

// The lists this title holds a place on, as list tiles: each is painted from
// its own leader and links to the list. The line under the leader is this
// title's rank, the number the linked page prints, ties included, so following
// the link shows where it came from. Same query as the closing rail, prefetched by the
// route so the links are in the HTML. Nothing renders while loading, on error,
// or for a title on no list.
//
// The tiles sit on the first screen, so they render only when the lists were
// in hand at first render. When the route's lookup ran past its budget, tiles
// arriving after hydration would shove the synopsis and everything under it
// down (a layout shift, counted in CLS) on every visit served that cached
// page. The caller keys this by title so the decision is made once per page.
function RanksOn({ mediaId }: { mediaId: string }) {
  const { data } = useQuery(appearsInQueryOptions(mediaId));
  const [inFirstRender] = useState(() => data !== undefined);
  const lists = inFirstRender ? (data?.ranksOn ?? []) : [];
  if (lists.length === 0) return null;
  const paint = paintTiles(lists.map((p) => p.lead));
  return (
    <section>
      <SectionHeading>Ranked lists</SectionHeading>
      <div
        className={cn(
          "grid gap-2.5",
          lists.length > 1 && "sm:grid-cols-2",
          lists.length > 2 && "lg:grid-cols-3",
        )}
      >
        {lists.map((p, i) => (
          <ListTile
            key={p.slug}
            slug={p.slug}
            title={p.title}
            itemCount={p.item_count}
            lead={p.lead}
            swatch={paint[i]}
            progress={`#${p.rank} of ${p.item_count}`}
          />
        ))}
      </div>
    </section>
  );
}

// The page closes on the shelf this title ranks in: the collection, the place
// it holds, and the titles either side of it carrying their rank numerals, so
// the order on screen is explained by what is on screen. A reader who has
// decided no now has somewhere to go. The server never picks a list the tiles
// above already show, so the page names each list once; a title whose every
// list is a tile ends without a rail.
//
// Fail-soft: nothing renders while loading, on error, or for a title that has
// not earned a shelf spot. Those titles end the page where it ended before.
function ShelfRail({ mediaId, title }: { mediaId: string; title: string }) {
  const { data } = useQuery(appearsInQueryOptions(mediaId));
  const shelf = data?.shelf;
  // Two slots is not a shelf, and a rail of one card is a worse ending than
  // no rail at all.
  if (!shelf || shelf.neighbors.length < 3) return null;
  return (
    <section className="mx-auto max-w-content px-4 pb-16">
      <SectionHeading>
        <Link to="/best/$slug" params={{ slug: shelf.slug }} className="hover:underline">
          {shelf.title}
        </Link>
      </SectionHeading>
      <p className="mb-3 text-lg text-text-muted">
        {title} is{" "}
        <span className="font-bold tabular-nums text-text-bright">
          #{shelf.rank} of {shelf.item_count}
        </span>
      </p>
      <ScrollRail label={shelf.title}>
        {shelf.neighbors.map((slot) => (
          <div key={slot.item.id} className="w-[118px] shrink-0 md:w-[132px]">
            <MediaCard
              item={slot.item}
              imgSizes="(min-width: 768px) 132px, 118px"
              posterOverlay={
                // A chip, not a numeral on the bare poster: white type with a
                // shadow vanished on bright posters. This title's own slot is
                // the gold one.
                <span
                  aria-hidden="true"
                  className={cn(
                    "inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 font-display text-base font-extrabold tabular-nums leading-none",
                    slot.item.id === mediaId
                      ? "bg-swatch-gold text-swatch-gold-ink"
                      : "bg-text-bright text-background",
                  )}
                >
                  {slot.rank}
                </span>
              }
            />
          </div>
        ))}
      </ScrollRail>
    </section>
  );
}

/** One row per person: "Christopher Nolan, Director, Writer", not two rows
 *  with the writing credit first. Director leads; the other jobs keep the
 *  order the payload gave them. */
function mergeCrew(crew: MediaDetailType["crew"]): MediaDetailType["crew"] {
  const byPerson = new Map<string, { person: MediaDetailType["crew"][number]; roles: string[] }>();
  for (const p of crew) {
    const key = p.personId != null ? `id:${p.personId}` : `name:${p.name}`;
    const hit = byPerson.get(key);
    if (!hit) byPerson.set(key, { person: p, roles: p.role ? [p.role] : [] });
    else if (p.role && !hit.roles.includes(p.role)) hit.roles.push(p.role);
  }
  return [...byPerson.values()].map(({ person, roles }) => {
    const sorted = [
      ...roles.filter((r) => r === "Director"),
      ...roles.filter((r) => r !== "Director"),
    ];
    return { ...person, role: sorted.join(", ") };
  });
}

// `mono` marks a value that is a number or a sum of money: its figures line up
// (tabular), in the same Archivo as everything else a person reads.
function FactRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-text-muted">{k}</dt>
      <dd className={cn("truncate font-semibold text-text-bright", mono && "tabular-nums")}>{v}</dd>
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
        className="flex items-center justify-between rounded-full border border-border-strong bg-background px-3 py-1.5 text-base font-semibold text-text-bright hover:border-primary"
      >
        <span>{label}</span>
        <ExternalLink className="h-3 w-3" />
      </a>
    </li>
  );
}

function DetailLoader() {
  return (
    <div className="bg-panel">
      <div className="mx-auto max-w-content px-4 pb-8 pt-4 md:pb-12 md:pt-6">
        <div className="aspect-video animate-pulse rounded-xl bg-background md:aspect-auto md:h-96 md:rounded-2xl" />
        <div className="mt-6 h-10 w-2/3 animate-pulse rounded-lg bg-background" />
        <div className="mt-3 h-4 w-1/3 animate-pulse rounded-sm bg-background" />
      </div>
    </div>
  );
}

function DetailFetcher({
  type,
  id,
  episodeRatings,
  swatch,
}: {
  type: "movie" | "tv";
  id: string;
  episodeRatings?: EpisodeRating[];
  swatch?: SwatchKey | null;
}) {
  const { data } = useMediaDetail(type, id);
  return (
    <DetailInner
      detail={data}
      episodeRatings={episodeRatings}
      swatch={swatch ?? data.swatch ?? null}
    />
  );
}

export function MediaDetail({
  mediaType,
  id,
  episodeRatings,
  swatch,
}: {
  mediaType: "movie" | "tv";
  id: string;
  /** TV only: stored per-episode ratings, loaded by the /tv/$id route. */
  episodeRatings?: EpisodeRating[];
  /** The poster's tile colour (media.swatch), read by the route loader so the
   *  band is painted in the server-rendered HTML. Null paints it on paper. */
  swatch?: SwatchKey | null;
}) {
  return (
    <div className="relative min-h-screen bg-background">
      <main id="main">
        <Suspense fallback={<DetailLoader />}>
          <DetailFetcher type={mediaType} id={id} episodeRatings={episodeRatings} swatch={swatch} />
        </Suspense>
      </main>
    </div>
  );
}
