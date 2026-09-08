import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { AmbientGlow } from "@/components/balasaur/AmbientGlow";
import {
  EmptyState,
  EMPTY_ACTION_CLASS,
  EMPTY_ACTION_QUIET_CLASS,
} from "@/components/balasaur/EmptyState";
import { EpisodeHeatmap } from "@/components/balasaur/EpisodeHeatmap";
import { TasteCardPreview } from "@/components/balasaur/TasteCardPreview";
import { ScoreBadge } from "@/components/balasaur/ScoreBadge";
import { computeTaste, type TitleFact } from "@/lib/taste";
import type { EpisodeRating, SeasonSize } from "@/lib/episodes";
import type { StatusMap } from "@/hooks/useUserStatus";
import { noindexMeta } from "@/lib/seo";

// Dev-only preview harness for the refinement pass. /dev/refine?panel=<name>
// renders one of the four pieces that cannot be seen against a live database:
// the episode heatmap, the taste card, the ambient glow over a detail layout,
// and the empty states. Every panel is fed a fixture, so the same screenshot
// comes back on any machine with no network.
//
// Production builds 404 this route from the loader and it is not in the
// sitemap. Posters are inline SVG data URIs so they draw offline.

type Panel = "heatmap" | "taste" | "glow" | "empty";

const PANELS: Panel[] = ["heatmap", "taste", "glow", "empty"];

export const Route = createFileRoute("/dev/refine")({
  validateSearch: (s: Record<string, unknown>): { panel: Panel } => ({
    panel: PANELS.includes(s.panel as Panel) ? (s.panel as Panel) : "heatmap",
  }),
  loader: async () => {
    if (!import.meta.env.DEV) throw notFound();
    return null;
  },
  head: () => ({
    meta: [{ title: "Refine preview" }, noindexMeta()],
  }),
  component: DevRefinePage,
});

// ---------------------------------------------------------------------------
// Fixture posters: a 2:3 card with a two-tone gradient and the title, so a
// human can tell one from another in a screenshot.

function poster(title: string, from: string, to: string): string {
  const words = title.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > 11) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? cur + " " + w : w;
  }
  if (cur) lines.push(cur);
  const text = lines
    .map(
      (l, i) =>
        `<text x="150" y="${300 - (lines.length - 1) * 22 + i * 44}" font-family="sans-serif" font-size="30" font-weight="700" fill="#ffffff" text-anchor="middle">${l.replace(/&/g, "&amp;")}</text>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="300" height="450" fill="url(#g)"/>${text}</svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

// ---------------------------------------------------------------------------
// Panel 1: the heatmap, six seasons.
//
// Season 4 is the peak and season 6 the trough, so the sentence under the grid
// has something to say. Two episodes in season 5 are unrated, which is what a
// real show looks like and keeps coverage above the 60% gate.

const SEASON_SIZES: SeasonSize[] = [
  { seasonNumber: 1, episodeCount: 10 },
  { seasonNumber: 2, episodeCount: 13 },
  { seasonNumber: 3, episodeCount: 13 },
  { seasonNumber: 4, episodeCount: 10 },
  { seasonNumber: 5, episodeCount: 12 },
  { seasonNumber: 6, episodeCount: 8 },
];

const SEASON_BASE = [7.6, 8.1, 8.5, 9.3, 8.0, 7.0];

/** A repeatable wobble, so the grid is not six flat columns. */
function wobble(season: number, episode: number): number {
  const n = Math.sin(season * 12.9898 + episode * 78.233) * 43758.5453;
  return (n - Math.floor(n) - 0.5) * 0.9;
}

const EPISODE_ROWS: EpisodeRating[] = SEASON_SIZES.flatMap((s) => {
  const rows: EpisodeRating[] = [];
  for (let e = 1; e <= s.episodeCount; e++) {
    // Two holes in season 5: an unrated episode is grey, not a bad episode.
    if (s.seasonNumber === 5 && (e === 4 || e === 9)) continue;
    const base = SEASON_BASE[s.seasonNumber - 1];
    const finale = e === s.episodeCount ? 0.5 : 0;
    const rating = Math.min(9.9, Math.max(4.5, base + finale + wobble(s.seasonNumber, e)));
    rows.push({
      season: s.seasonNumber,
      episode: e,
      rating: Math.round(rating * 10) / 10,
      votes: 400 + ((s.seasonNumber * 31 + e * 7) % 900),
      airDate: `20${String(9 + s.seasonNumber).padStart(2, "0")}-${String(((e - 1) % 12) + 1).padStart(2, "0")}-08`,
      name: `Episode ${e}`,
    });
  }
  return rows;
});

// ---------------------------------------------------------------------------
// Panel 2: the taste card, drawn from a seeded library.
//
// The statuses and the facts are what a real visitor's localStorage and the
// catalog would hand `computeTaste`, so the archetype on the card is named by
// the real rule table rather than typed in here.

interface Seed {
  id: string;
  title: string;
  year: string;
  mediaType: string;
  genres: string[];
  origins: string[];
  score: number;
  critic?: number;
  from: string;
  to: string;
  state: "liked" | "seen" | "want";
}

const SEEDS: Seed[] = [
  {
    id: "t1",
    title: "The Vanishing Hour",
    year: "2019",
    mediaType: "tv",
    genres: ["Drama", "Crime"],
    origins: ["us"],
    score: 91,
    critic: 88,
    from: "#1e3a5f",
    to: "#0d1b2a",
    state: "liked",
  },
  {
    id: "t2",
    title: "Cold Harbour",
    year: "2021",
    mediaType: "tv",
    genres: ["Drama", "Thriller"],
    origins: ["gb"],
    score: 88,
    critic: 81,
    from: "#3d2c4a",
    to: "#160f1e",
    state: "liked",
  },
  {
    id: "t3",
    title: "Salt and Iron",
    year: "2017",
    mediaType: "tv",
    genres: ["Drama"],
    origins: ["us"],
    score: 86,
    critic: 79,
    from: "#4a3520",
    to: "#1c1208",
    state: "liked",
  },
  {
    id: "t4",
    title: "Nightjar",
    year: "2023",
    mediaType: "tv",
    genres: ["Mystery", "Drama"],
    origins: ["kr"],
    score: 84,
    critic: 74,
    from: "#1f4038",
    to: "#0a1a16",
    state: "liked",
  },
  {
    id: "t5",
    title: "The Long Field",
    year: "2015",
    mediaType: "tv",
    genres: ["Drama", "History"],
    origins: ["gb"],
    score: 83,
    critic: 85,
    from: "#2b3a2f",
    to: "#101710",
    state: "liked",
  },
  {
    id: "t6",
    title: "Paper Moons",
    year: "2020",
    mediaType: "movie",
    genres: ["Drama", "Romance"],
    origins: ["fr"],
    score: 82,
    critic: 77,
    from: "#4a2030",
    to: "#1a0b12",
    state: "liked",
  },
  {
    id: "t7",
    title: "Venomcrawl",
    year: "2018",
    mediaType: "movie",
    genres: ["Action", "Science Fiction"],
    origins: ["us"],
    score: 71,
    critic: 31,
    from: "#2a1c3f",
    to: "#0e0817",
    state: "liked",
  },
  {
    id: "t8",
    title: "Second Sitting",
    year: "2022",
    mediaType: "tv",
    genres: ["Comedy"],
    origins: ["us"],
    score: 80,
    critic: 72,
    from: "#3f3a18",
    to: "#161408",
    state: "liked",
  },
  {
    id: "t9",
    title: "The Quiet Wards",
    year: "2016",
    mediaType: "tv",
    genres: ["Drama"],
    origins: ["us"],
    score: 85,
    critic: 83,
    from: "#1c3346",
    to: "#0a1119",
    state: "seen",
  },
  {
    id: "t10",
    title: "Ashfall Road",
    year: "1998",
    mediaType: "movie",
    genres: ["Drama", "Western"],
    origins: ["us"],
    score: 78,
    critic: 69,
    from: "#43301c",
    to: "#171008",
    state: "seen",
  },
  {
    id: "t11",
    title: "Harbour Lights",
    year: "2024",
    mediaType: "tv",
    genres: ["Drama", "Crime"],
    origins: ["gb"],
    score: 81,
    critic: 76,
    from: "#243c4a",
    to: "#0c151b",
    state: "seen",
  },
  {
    id: "t12",
    title: "The Understudy",
    year: "2013",
    mediaType: "movie",
    genres: ["Thriller"],
    origins: ["us"],
    score: 74,
    critic: 66,
    from: "#33203a",
    to: "#120b15",
    state: "want",
  },
  {
    id: "t13",
    title: "Grain of the Wood",
    year: "2025",
    mediaType: "tv",
    genres: ["Drama"],
    origins: ["jp"],
    score: 87,
    critic: 84,
    from: "#1e3b2c",
    to: "#0a1710",
    state: "want",
  },
  {
    id: "t14",
    title: "Nine Winters",
    year: "2011",
    mediaType: "tv",
    genres: ["Drama", "Mystery"],
    origins: ["se"],
    score: 89,
    critic: 86,
    from: "#2c2f45",
    to: "#101119",
    state: "want",
  },
];

const TASTE_STATUSES: StatusMap = Object.fromEntries(
  SEEDS.map((s) => [
    s.id,
    s.state === "want"
      ? { status: "unseen" as const, intent: "want" as const, ts: 1 }
      : s.state === "liked"
        ? { status: "seen" as const, sentiment: "liked" as const, ts: 1 }
        : { status: "seen" as const, ts: 1 },
  ]),
);

const TASTE_FACTS: TitleFact[] = SEEDS.map((s) => ({
  id: s.id,
  title: s.title,
  year: s.year,
  mediaType: s.mediaType,
  genres: s.genres,
  origins: s.origins,
  posterUrl: poster(s.title, s.from, s.to),
  score: s.score,
  critic: s.critic,
  criticSource: "Metacritic" as const,
}));

// ---------------------------------------------------------------------------
// Panel 3: the glow, over the top of a detail page.

const GLOW_A = "#c2410c";
const GLOW_B = "#1d4ed8";

// ---------------------------------------------------------------------------

function DevRefinePage() {
  const { panel } = Route.useSearch();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <nav className="mx-auto flex w-full max-w-[1100px] flex-wrap gap-2 px-5 pt-5">
        {PANELS.map((p) => (
          <Link
            key={p}
            to="/dev/refine"
            search={{ panel: p }}
            className={
              "rounded-[5px] border px-3 py-1.5 text-[13px] font-semibold " +
              (p === panel
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border-strong bg-background text-text-muted")
            }
          >
            {p}
          </Link>
        ))}
      </nav>
      <main id="main" className="mx-auto w-full max-w-[1100px] px-5 py-8">
        {panel === "heatmap" && <HeatmapPanel />}
        {panel === "taste" && <TastePanel />}
        {panel === "glow" && <GlowPanel />}
        {panel === "empty" && <EmptyPanel />}
      </main>
    </div>
  );
}

function HeatmapPanel() {
  return (
    <section>
      <h1 className="text-[24px] font-black tracking-[-0.02em] text-text-bright">
        Six seasons, 64 rated episodes
      </h1>
      <div className="mt-6 rounded-[5px] border border-border bg-panel p-5">
        <EpisodeHeatmap rows={EPISODE_ROWS} seasons={SEASON_SIZES} />
      </div>
    </section>
  );
}

function TastePanel() {
  const profile = computeTaste(TASTE_STATUSES, TASTE_FACTS);
  if (!profile.archetype) {
    return <p className="text-[15px] text-text-muted">The seed did not reach an archetype.</p>;
  }
  return (
    <section>
      <h1 className="text-[28px] font-black leading-[1.05] tracking-[-0.02em] text-text-bright">
        {profile.archetype.name}
      </h1>
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
    </section>
  );
}

function GlowPanel() {
  return (
    <section className="relative isolate">
      <AmbientGlow colorA={GLOW_A} colorB={GLOW_B} />
      <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
        <img
          src={poster("Ashfall Road", GLOW_A, "#1a0f06")}
          alt=""
          width={220}
          height={330}
          className="w-[160px] shrink-0 rounded-[6px] sm:w-[220px]"
          style={{ backgroundColor: GLOW_A }}
        />
        <div className="min-w-0">
          <h1 className="text-[32px] font-black leading-[1.03] tracking-[-0.02em] text-text-bright sm:text-[44px]">
            Ashfall Road
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <ScoreBadge score={84} />
            <span className="font-mono text-[13px] tabular-nums text-text-muted">1998</span>
            <span className="font-mono text-[13px] tabular-nums text-text-muted">2h 11m</span>
            <span className="text-[13px] text-text-muted">Drama, Western</span>
          </div>
          <p className="mt-5 max-w-prose text-[15px] leading-relaxed text-text-muted">
            A rancher walks two hundred miles to testify against the man who bought his valley, and
            finds the courthouse already sold.
          </p>
        </div>
      </div>
      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {SEEDS.slice(0, 4).map((s) => (
          <div key={s.id} className="rounded-[5px] border border-border bg-panel p-3">
            <img
              src={poster(s.title, s.from, s.to)}
              alt=""
              width={200}
              height={300}
              className="w-full rounded-[4px]"
            />
            <p className="mt-2 truncate text-[13px] font-semibold text-text-bright">{s.title}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function EmptyPanel() {
  return (
    <section className="flex flex-col gap-8">
      <EmptyState
        line="No title matches every filter at once."
        hint="Loosen a filter, or clear them and start again."
        action={
          <button type="button" className={EMPTY_ACTION_QUIET_CLASS}>
            Clear all filters
          </button>
        }
      />
      <EmptyState
        mood="chomp"
        line="The room stays empty until it knows what you have watched."
        hint="Mark a few titles seen, or save some for later. They arrive here ready to shelve."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button type="button" className={EMPTY_ACTION_CLASS}>
              Rate titles
            </button>
            <button type="button" className={EMPTY_ACTION_QUIET_CLASS}>
              Browse the catalog
            </button>
          </div>
        }
      />
      <div className="rounded-[5px] border border-border bg-panel p-5">
        <p className="text-[13px] text-text-dim">Inline, inside a panel that already exists.</p>
        <EmptyState
          variant="inline"
          line={'Nothing matches "kurosawa noir".'}
          hint="Collections are named by genre, service, decade, and year. Try one of those."
          action={
            <button type="button" className={EMPTY_ACTION_QUIET_CLASS}>
              Clear the search
            </button>
          }
        />
      </div>
    </section>
  );
}
