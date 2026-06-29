import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, SkipForward, X } from "lucide-react";
import type { MediaItem } from "@/types/media";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useAuth } from "@/hooks/useAuth";
import { AuthDialog } from "./AuthDialog";
import {
  recordForStatus,
  recordForSkip,
  recordForNotInterested,
  type StatusKey,
} from "@/lib/userStatus";
import { tmdbImage, tmdbSrcSet } from "@/lib/tmdbImage";

// After this many anonymous picks, nudge the user to sign in to save them.
const NUDGE_AFTER = 5;

type Dir = "up" | "down" | "left" | "right";

// Direction → meaning. "down" is Skip (soft, resurfaces); the rest file & leave.
const DIR_TO_KEY: Record<Exclude<Dir, "down">, StatusKey> = {
  up: "like",
  right: "watched",
  left: "didntWatch",
};

const ACTION_LABEL: Record<Dir, string> = {
  up: "Like",
  right: "Watched",
  left: "Didn't watch yet",
  down: "Skip",
};

const ACTION_HEX: Record<Dir, string> = {
  up: "#9fe6a0", // favorites
  right: "#3b82f6", // history
  left: "#e8b84b", // watchlist
  down: "#9aa2b1", // skip (neutral grey)
};

const ACTION_SUBLABEL: Record<Dir, string> = {
  up: "Favorites + History",
  right: "History",
  left: "Watchlist",
  down: "Resurfaces later",
};

interface Summary {
  total: number;
  like: number;
  watched: number;
  didntWatch: number;
  skip: number;
  notInterested: number;
}

export function LibraryDeck({ items }: { items: MediaItem[] }) {
  const { statuses, recordStatus, isAnonymous, justMigrated, clearJustMigrated, ready } =
    useUserStatus();
  const { user } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  // Picks made this session (drives the anon "sign in to save your N" nudge).
  const [sessionPicks, setSessionPicks] = useState(0);

  // Build the deck once on mount. Untouched first; previously-skipped items
  // resurface at the back (deprioritized, never hidden). Filed items (like/
  // watched/didn't-watch) are excluded — they've left the deck.
  // Build the deck once, the first time statuses have loaded (`ready`). statuses is
  // read at that moment but kept out of the deps on purpose: every swipe mutates
  // statuses, and we don't want the deck to reshuffle mid-session. Gating on
  // `ready` fixes the bug where the deck was built against the empty initial
  // statuses map (it loads async) and so re-showed titles already filed.
  const deck = useMemo(() => {
    if (!ready) return [];
    const untouched = items.filter((i) => !statuses[i.id]);
    const skipped = items.filter((i) => statuses[i.id]?.status === "skipped");
    return [...untouched, ...skipped];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, ready]);

  const [index, setIndex] = useState(0);
  const [summary, setSummary] = useState<Summary>({
    total: 0,
    like: 0,
    watched: 0,
    didntWatch: 0,
    skip: 0,
    notInterested: 0,
  });
  const [exit, setExit] = useState<Dir | null>(null);
  const [done, setDone] = useState(false);

  const current = deck[index];
  const next = deck[index + 1];

  // Confirm the local→account migration once, after sign-in.
  useEffect(() => {
    if (justMigrated > 0) {
      toast.success(
        `Saved your ${justMigrated} ${justMigrated === 1 ? "pick" : "picks"} to your account.`,
      );
      clearJustMigrated();
    }
  }, [justMigrated, clearJustMigrated]);

  const advance = useCallback(
    (dir: Dir) => {
      if (!current) return;
      if (dir === "down") {
        recordStatus(current.id, recordForSkip(), current);
        setSummary((s) => ({ ...s, total: s.total + 1, skip: s.skip + 1 }));
      } else {
        const key = DIR_TO_KEY[dir];
        recordStatus(current.id, recordForStatus(key), current);
        setSummary((s) => ({
          ...s,
          total: s.total + 1,
          like: s.like + (key === "like" ? 1 : 0),
          watched: s.watched + (key === "watched" ? 1 : 0),
          didntWatch: s.didntWatch + (key === "didntWatch" ? 1 : 0),
        }));
        // Signed-in: confirm the save so it never looks like nothing happened.
        if (user) toast.success(`Saved · ${ACTION_LABEL[dir]}`, { duration: 1400 });
      }
      setSessionPicks((n) => n + 1);
      setExit(dir);
      window.setTimeout(() => {
        setExit(null);
        setIndex((i) => {
          const ni = i + 1;
          if (ni >= deck.length) setDone(true);
          return ni;
        });
      }, 220);
    },
    [current, deck.length, recordStatus, user],
  );

  // Not interested: a hard reject (won't watch). Files into no list and — unlike Skip —
  // never comes back in the deck. Reuses the downward dismiss animation.
  const markNotInterested = useCallback(() => {
    if (!current) return;
    recordStatus(current.id, recordForNotInterested(), current);
    setSummary((s) => ({ ...s, total: s.total + 1, notInterested: s.notInterested + 1 }));
    if (user) toast(`Not interested · hidden`, { duration: 1400 });
    setSessionPicks((n) => n + 1);
    setExit("down");
    window.setTimeout(() => {
      setExit(null);
      setIndex((i) => {
        const ni = i + 1;
        if (ni >= deck.length) setDone(true);
        return ni;
      });
    }, 220);
  }, [current, deck.length, recordStatus, user]);

  const showNudge = isAnonymous && !nudgeDismissed && sessionPicks >= NUDGE_AFTER;

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (done) return;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        advance("up");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        advance("down");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        advance("left");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        advance("right");
      } else if (e.key === " " || e.key.toLowerCase() === "s") {
        e.preventDefault();
        advance("down");
      } else if (e.key.toLowerCase() === "x") {
        e.preventDefault();
        markNotInterested();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, markNotInterested, done]);

  if (!ready) {
    return (
      <div className="mx-auto flex h-[560px] w-full max-w-md items-center justify-center">
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-text-dim">
          Loading…
        </span>
      </div>
    );
  }

  if (done || !current) {
    return (
      <>
        <LibrarySummary
          summary={summary}
          anonUnsaved={isAnonymous && summary.total > 0 ? summary.total : 0}
          onSignIn={() => setAuthOpen(true)}
        />
        <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
      </>
    );
  }

  return (
    <div className="relative mx-auto flex h-full w-full max-w-md flex-col items-center justify-between gap-4 px-4 py-4">
      <div className="font-mono text-[10.5px] uppercase tracking-wider text-text-muted">
        {index + 1} / {deck.length} · sorted {summary.total}
      </div>

      {showNudge && (
        <div className="flex w-full max-w-[360px] items-center gap-2 rounded-[5px] border border-primary/40 bg-primary/10 px-3 py-2">
          <span className="flex-1 font-mono text-[10.5px] uppercase tracking-wider text-text-bright">
            Sign in to save your {sessionPicks} picks
          </span>
          <button
            type="button"
            onClick={() => setAuthOpen(true)}
            className="cursor-pointer rounded-[4px] bg-primary px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setNudgeDismissed(true)}
            aria-label="Dismiss"
            className="cursor-pointer text-text-muted hover:text-text-bright"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="relative h-[560px] w-full max-w-[360px]">
        {/* Next card behind, peek */}
        {next && (
          <div className="absolute inset-0 scale-[0.96] opacity-50">
            <CardFace item={next} />
          </div>
        )}
        {/* Active card */}
        <DraggableCard
          key={current.id}
          item={current}
          forcedExit={exit}
          onCommit={(dir) => advance(dir)}
        />
      </div>

      <Legend />

      <div className="flex w-full items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => advance("down")}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-[5px] border border-border bg-panel px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-text-bright hover:border-border-strong"
        >
          <SkipForward className="h-3.5 w-3.5" />
          Skip
        </button>
        <button
          type="button"
          onClick={markNotInterested}
          title="Won't watch — hide for good (key: X)"
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-[5px] border border-border bg-panel px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-text-muted hover:border-border-strong hover:text-text-bright"
        >
          <X className="h-3.5 w-3.5" />
          Not interested
        </button>
      </div>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </div>
  );
}

function DraggableCard({
  item,
  forcedExit,
  onCommit,
}: {
  item: MediaItem;
  forcedExit: Dir | null;
  onCommit: (dir: Dir) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number; id: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (forcedExit) return;
    startRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    setDragging(true);
    ref.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current || startRef.current.id !== e.pointerId) return;
    setDx(e.clientX - startRef.current.x);
    setDy(e.clientY - startRef.current.y);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current) return;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const THRESHOLD = 90;
    let dir: Dir | null = null;
    if (Math.max(ax, ay) >= THRESHOLD) {
      if (ax > ay) dir = dx > 0 ? "right" : "left";
      else dir = dy > 0 ? "down" : "up";
    }
    startRef.current = null;
    ref.current?.releasePointerCapture(e.pointerId);
    setDragging(false);
    if (dir) {
      onCommit(dir);
    } else {
      setDx(0);
      setDy(0);
    }
  };

  // Determine cue based on dominant axis while dragging
  const cue: Dir | null = (() => {
    if (forcedExit) return forcedExit;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < 20) return null;
    if (ax > ay) return dx > 0 ? "right" : "left";
    return dy > 0 ? "down" : "up";
  })();

  // Exit animation transform
  let transform = `translate(${dx}px, ${dy}px) rotate(${dx / 25}deg)`;
  if (forcedExit) {
    const off = 800;
    const map: Record<Dir, [number, number, number]> = {
      up: [0, -off, 0],
      down: [0, off, 0],
      left: [-off, 0, -20],
      right: [off, 0, 20],
    };
    const [x, y, r] = map[forcedExit];
    transform = `translate(${x}px, ${y}px) rotate(${r}deg)`;
  }

  const cueIntensity = Math.min(1, Math.max(Math.abs(dx), Math.abs(dy)) / 180);

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="absolute inset-0 touch-none select-none"
      style={{
        transform,
        transition: dragging ? "none" : "transform 220ms ease-out",
        cursor: dragging ? "grabbing" : "grab",
      }}
    >
      <CardFace item={item} cue={cue} cueIntensity={cueIntensity} />
    </div>
  );
}

function CardFace({
  item,
  cue,
  cueIntensity = 0,
}: {
  item: MediaItem;
  cue?: Dir | null;
  cueIntensity?: number;
}) {
  const rating = item.ratings.imdb ?? item.ratings.tmdb;
  const cueColor = cue ? ACTION_HEX[cue] : null;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[8px] border border-border bg-panel shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]">
      {item.posterUrl ? (
        <img
          src={tmdbImage(item.posterUrl, "w780")}
          srcSet={tmdbSrcSet(item.posterUrl, [
            { w: 500, size: "w500" },
            { w: 780, size: "w780" },
          ])}
          sizes="(max-width: 768px) 100vw, 420px"
          alt={item.title}
          draggable={false}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-accent text-text-dim">
          <span className="font-mono text-[12px] uppercase">No art</span>
        </div>
      )}

      {/* Bottom gradient + text */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4">
        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-white/80">
          <span>{item.mediaType === "movie" ? "Movie" : "TV"}</span>
          {item.year && <span>· {item.year}</span>}
          {rating !== undefined && <span>· ★ {rating.toFixed(1)}</span>}
        </div>
        <h2 className="text-[20px] font-semibold leading-tight text-white">{item.title}</h2>
        {item.overview && (
          <p className="mt-2 line-clamp-3 text-[12.5px] leading-snug text-white/85">
            {item.overview}
          </p>
        )}
      </div>

      {/* Directional cue overlay */}
      {cueColor && (
        <div
          className="pointer-events-none absolute inset-0 rounded-[8px]"
          style={{
            boxShadow: `inset 0 0 0 4px ${cueColor}`,
            backgroundColor: cueColor,
            opacity: 0.12 + cueIntensity * 0.18,
            transition: "opacity 80ms linear",
          }}
        />
      )}
      {cue && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span
            className="rounded-[6px] border-2 px-3 py-1 font-mono text-[12px] uppercase tracking-wider"
            style={{
              borderColor: cueColor!,
              color: cueColor!,
              backgroundColor: "rgba(0,0,0,0.55)",
              opacity: 0.4 + cueIntensity * 0.6,
            }}
          >
            {ACTION_LABEL[cue]}
          </span>
        </div>
      )}
    </div>
  );
}

function Legend() {
  const rows: { dir: Dir; icon: React.ReactNode }[] = [
    { dir: "up", icon: <ArrowUp className="h-3 w-3" /> },
    { dir: "right", icon: <ArrowRight className="h-3 w-3" /> },
    { dir: "left", icon: <ArrowLeft className="h-3 w-3" /> },
    { dir: "down", icon: <ArrowDown className="h-3 w-3" /> },
  ];
  return (
    <div className="w-full max-w-[360px] space-y-1.5 rounded-[5px] border border-border bg-panel/60 p-2">
      <div className="text-center font-mono text-[9.5px] uppercase tracking-wider text-text-dim">
        Swipe to sort · only Skip comes back
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {rows.map((r) => (
          <div
            key={r.dir}
            className="flex items-center gap-1.5 rounded-[4px] border border-border px-1.5 py-1"
          >
            <span
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px]"
              style={{ backgroundColor: ACTION_HEX[r.dir], color: "#0b0d10" }}
            >
              {r.icon}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-mono text-[10px] uppercase tracking-wider text-text-bright">
                {ACTION_LABEL[r.dir]}
              </span>
              <span className="block truncate font-mono text-[8.5px] uppercase tracking-wider text-text-dim">
                {ACTION_SUBLABEL[r.dir]}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LibrarySummary({
  summary,
  anonUnsaved,
  onSignIn,
}: {
  summary: Summary;
  anonUnsaved: number;
  onSignIn: () => void;
}) {
  const lines: { label: string; value: number; color: string }[] = [
    { label: "Liked", value: summary.like, color: ACTION_HEX.up },
    { label: "Watched", value: summary.watched, color: ACTION_HEX.right },
    { label: "Didn't watch yet", value: summary.didntWatch, color: ACTION_HEX.left },
    { label: "Skipped", value: summary.skip, color: ACTION_HEX.down },
    { label: "Not interested", value: summary.notInterested, color: "#c75d6e" },
  ];

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <div>
        <div className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-text-muted">
          Session complete
        </div>
        <div className="mt-2 text-[40px] font-semibold text-text-bright">
          You sorted {summary.total}
        </div>
      </div>

      {anonUnsaved > 0 && (
        <div className="flex w-full items-center gap-3 rounded-[5px] border border-primary/40 bg-primary/10 px-3 py-2.5 text-left">
          <Check className="h-4 w-4 shrink-0 text-primary" />
          <span className="flex-1 font-mono text-[10.5px] uppercase tracking-wider text-text-bright">
            Saved on this device · sign in to keep your {anonUnsaved} picks
          </span>
          <button
            type="button"
            onClick={onSignIn}
            className="shrink-0 cursor-pointer rounded-[4px] bg-primary px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
          >
            Sign in
          </button>
        </div>
      )}

      <ul className="w-full space-y-1.5">
        {lines.map((l) => (
          <li
            key={l.label}
            className="flex items-center justify-between rounded-[5px] border border-border bg-panel px-3 py-2"
          >
            <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-text-bright">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: l.color }}
              />
              {l.label}
            </span>
            <span className="font-mono text-[14px] text-text-bright">{l.value}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link
          to="/lists"
          className="rounded-[5px] border border-border-strong bg-background px-4 py-2 font-mono text-[12px] uppercase tracking-wider text-text-bright hover:border-primary hover:text-primary"
        >
          View my library
        </Link>
        <Link
          to="/"
          className="rounded-[5px] bg-primary px-4 py-2 font-mono text-[12px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
        >
          Back to the grid
        </Link>
      </div>
    </div>
  );
}

export function LibraryHeader() {
  return (
    <header className="flex h-12 items-center justify-between border-b border-border px-4">
      <div className="font-mono text-[12px] uppercase tracking-[0.18em] text-text-bright">
        Rate Titles
      </div>
      <Link
        to="/"
        className="inline-flex items-center gap-1 rounded-[4px] border border-border px-2 py-1 font-mono text-[10.5px] uppercase tracking-wider text-text-muted hover:border-border-strong hover:text-text-bright"
      >
        <X className="h-3 w-3" />
        Exit
      </Link>
    </header>
  );
}
