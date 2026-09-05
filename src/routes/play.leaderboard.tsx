import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { CometChip } from "@/components/arcade/CometChip";
import { WeeklyBoardList } from "@/components/arcade/WeeklyBoard";
import { arcadeWeeklyBoard, type ArcadeWeeklyBoard } from "@/lib/arcade";
import { weekSpan } from "@/lib/arcade/week";
import { useViewerCountry } from "@/hooks/useCatalog";
import { useMyProfile } from "@/hooks/useMyProfile";
import { SITE_ORIGIN, buildMeta, cacheSsrResponse, canonicalLink, noindexMeta } from "@/lib/seo";

// The weekly comet board. Client-rendered and noindexed: the rows churn
// hourly, which is exactly the thin content a crawler should skip, but the
// links out (follow) still count. Guests never appear; comets on the board
// come only from signed-in runs by players with public profiles.

export const Route = createFileRoute("/play/leaderboard")({
  loader: async () => {
    await cacheSsrResponse(3600, 300);
    return null;
  },
  head: () => {
    const url = `${SITE_ORIGIN}/play/leaderboard`;
    return {
      meta: [
        ...buildMeta({
          title: "Arcade Leaderboard | Balasaur",
          description: "This week's comet standings across every game in the arcade.",
          url,
          image: `${SITE_ORIGIN}/og-play.png`,
        }),
        noindexMeta(),
      ],
      links: [canonicalLink(url)],
    };
  },
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const country = useViewerCountry();
  const { data: me } = useMyProfile();
  const [scope, setScope] = useState<"global" | "country">("global");
  const [board, setBoard] = useState<ArcadeWeeklyBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    setLoading(true);
    setFailed(false);
    arcadeWeeklyBoard({
      country: scope === "country" && country ? country : undefined,
      limit: 100,
    })
      .then((b) => {
        if (dead) return;
        // The RPC reports failure as {error}; it does not throw.
        if (b.error) setFailed(true);
        else setBoard(b);
        setLoading(false);
      })
      .catch(() => {
        if (!dead) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => {
      dead = true;
    };
  }, [scope, country]);

  const rows = board?.rows ?? [];
  const span = board ? weekSpan(board.week_key) : "";
  const myName = me?.username ?? null;
  const myRow = myName ? rows.find((r) => r.username === myName) : undefined;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[560px] flex-1 px-5 py-8">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[28px] font-black leading-none tracking-[-0.02em] text-text-bright">
              This week's comets
            </h1>
            <p className="mt-2 text-[13.5px] text-text-muted">
              Comets won in every arcade game this week by signed-in players.
            </p>
          </div>
          <CometChip className="mt-1 shrink-0" />
        </div>

        <div className="mt-5 flex h-7 items-center justify-between">
          {country ? (
            <div className="flex gap-1.5" role="group" aria-label="Board scope">
              <ScopeButton active={scope === "global"} onClick={() => setScope("global")}>
                Global
              </ScopeButton>
              <ScopeButton active={scope === "country"} onClick={() => setScope("country")}>
                {country}
              </ScopeButton>
            </div>
          ) : (
            <span />
          )}
          {span && (
            <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
              {span}
            </span>
          )}
        </div>

        {loading ? (
          <div className="mt-4 h-64 animate-pulse rounded-[6px] border border-border bg-panel" />
        ) : failed ? (
          <p className="mt-4 text-[14px] text-text-muted">
            The board did not load. Try again in a minute.
          </p>
        ) : rows.length === 0 ? (
          <div className="mt-4 rounded-[6px] border border-border bg-panel p-4">
            <p className="text-[13.5px] text-text">
              Nobody is on this board yet. Comets are won in the games.
            </p>
            <Link
              to="/play"
              className="mt-3 inline-flex items-center rounded-[5px] bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
            >
              Play tonight's games
            </Link>
          </div>
        ) : (
          <div className="mt-4 rounded-[6px] border border-border bg-panel px-3 py-1">
            <div className="flex items-center gap-2.5 border-b border-border py-1.5 font-mono text-[10.5px] uppercase tracking-wider text-text-dim">
              <span className="w-6 shrink-0">#</span>
              <span className="min-w-0 flex-1">Player</span>
              <span className="shrink-0">Comets</span>
            </div>
            <WeeklyBoardList rows={rows} me={myName} showCountry />
          </div>
        )}

        {!loading && !failed && (
          <p className="mt-3 text-[12.5px] text-text-dim">
            {myName
              ? myRow
                ? `You are ${ordinal(myRow.rank)} with ${myRow.comets} ${myRow.comets === 1 ? "comet" : "comets"}.`
                : "Finish a game today and your comets go on this board."
              : "Sign in and your comets go on the board."}
          </p>
        )}
      </main>
    </div>
  );
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function ScopeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "rounded-[5px] border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider " +
        (active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-panel text-text-muted hover:text-text-bright")
      }
    >
      {children}
    </button>
  );
}
