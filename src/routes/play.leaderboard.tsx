import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { CometChip } from "@/components/arcade/CometChip";
import { arcadeWeeklyBoard, type ArcadeWeeklyBoard } from "@/lib/arcade";
import { useViewerCountry } from "@/hooks/useCatalog";
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

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[560px] flex-1 px-5 py-8">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[24px] font-bold tracking-tight text-text-bright">
            Weekly leaderboard
          </h1>
          <CometChip className="mt-1 shrink-0" />
        </div>
        <p className="mt-1 text-[13.5px] text-text-muted">
          Comets won this week by signed-in players, across every game.
        </p>

        <div className="mt-5 flex items-center justify-between">
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
          {board && (
            <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
              {board.week_key}
            </span>
          )}
        </div>

        {loading ? (
          <div className="mt-4 h-40 animate-pulse rounded-[6px] border border-border bg-panel" />
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
              Play today's games
            </Link>
          </div>
        ) : (
          <div className="mt-4 rounded-[6px] border border-border bg-panel px-3 py-2">
            <div className="flex items-baseline gap-2 border-b border-border py-1 font-mono text-[10.5px] uppercase tracking-wider text-text-dim">
              <span className="w-7 shrink-0">#</span>
              <span className="min-w-0 flex-1">Player</span>
              <span className="shrink-0">Comets</span>
            </div>
            {rows.map((row) => (
              <div
                key={`${row.rank}-${row.username}`}
                className="flex items-baseline gap-2 py-1 font-mono text-[12.5px] text-text"
              >
                <span className="w-7 shrink-0 tabular-nums text-text-dim">{row.rank}</span>
                <span className="min-w-0 flex-1 truncate">
                  {row.display_name || row.username}
                  {row.country && (
                    <span className="ml-1.5 text-[11px] text-text-dim">{row.country}</span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums">{row.comets}</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
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
