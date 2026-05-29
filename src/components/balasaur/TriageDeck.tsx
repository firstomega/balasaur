import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, SkipForward, X } from "lucide-react";
import type { MediaItem } from "@/types/media";
import { useUserStatus, type UserStatusRecord } from "@/hooks/useUserStatus";

type Dir = "up" | "down" | "left" | "right";

const ACTION_LABEL: Record<Dir, string> = {
  up: "Seen & loved",
  down: "Seen, didn't love",
  right: "Want it",
  left: "Not for me",
};

const ACTION_HEX: Record<Dir, string> = {
  up: "#9fe6a0",
  down: "#9aa2b1",
  right: "#3b82f6",
  left: "#ef4444",
};

function recordFor(dir: Dir): UserStatusRecord {
  const ts = Date.now();
  switch (dir) {
    case "up":
      return { status: "seen", sentiment: "liked", rewatchOk: true, ts };
    case "down":
      return { status: "seen", sentiment: "disliked", rewatchOk: false, ts };
    case "right":
      return { status: "unseen", intent: "want", ts };
    case "left":
      return { status: "unseen", intent: "not_interested", ts };
  }
}

interface Summary {
  total: number;
  loved: number;
  notLoved: number;
  want: number;
  notForMe: number;
}

export function TriageDeck({ items }: { items: MediaItem[] }) {
  const { statuses, recordStatus } = useUserStatus();

  // Build the deck once on mount: items the user hasn't acted on yet, then the rest.
  const deck = useMemo(() => {
    const untouched = items.filter((i) => !statuses[i.id]);
    const touched = items.filter((i) => statuses[i.id]);
    return [...untouched, ...touched];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const [index, setIndex] = useState(0);
  const [summary, setSummary] = useState<Summary>({
    total: 0,
    loved: 0,
    notLoved: 0,
    want: 0,
    notForMe: 0,
  });
  const [exit, setExit] = useState<Dir | null>(null);
  const [done, setDone] = useState(false);

  const current = deck[index];
  const next = deck[index + 1];

  const advance = useCallback(
    (dir: Dir | null) => {
      if (!current) return;
      if (dir) {
        recordStatus(current.id, recordFor(dir));
        setSummary((s) => ({
          total: s.total + 1,
          loved: s.loved + (dir === "up" ? 1 : 0),
          notLoved: s.notLoved + (dir === "down" ? 1 : 0),
          want: s.want + (dir === "right" ? 1 : 0),
          notForMe: s.notForMe + (dir === "left" ? 1 : 0),
        }));
      }
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
    [current, deck.length, recordStatus],
  );

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
        advance(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, done]);

  if (done || !current) {
    return <TriageSummary summary={summary} />;
  }

  return (
    <div className="relative mx-auto flex h-full w-full max-w-md flex-col items-center justify-between gap-4 px-4 py-4">
      <div className="font-mono text-[10.5px] uppercase tracking-wider text-text-muted">
        {index + 1} / {deck.length} · triaged {summary.total}
      </div>

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
          onClick={() => advance(null)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-[5px] border border-border bg-panel px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-text-bright hover:border-border-strong"
        >
          <SkipForward className="h-3.5 w-3.5" />
          Skip
        </button>
      </div>
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
          src={item.posterUrl}
          alt={item.title}
          draggable={false}
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
    { dir: "down", icon: <ArrowDown className="h-3 w-3" /> },
    { dir: "left", icon: <ArrowLeft className="h-3 w-3" /> },
  ];
  return (
    <div className="w-full max-w-[360px] space-y-1.5 rounded-[5px] border border-border bg-panel/60 p-2">
      <div className="flex items-center justify-between font-mono text-[9.5px] uppercase tracking-wider text-text-dim">
        <span>Vertical = I've seen this</span>
        <span>Horizontal = I haven't</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {rows.map((r) => (
          <div
            key={r.dir}
            className="flex items-center gap-1.5 rounded-[4px] border border-border px-1.5 py-1"
          >
            <span
              className="inline-flex h-4 w-4 items-center justify-center rounded-[3px]"
              style={{ backgroundColor: ACTION_HEX[r.dir], color: "#0b0d10" }}
            >
              {r.icon}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-bright">
              {ACTION_LABEL[r.dir]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TriageSummary({ summary }: { summary: Summary }) {
  const lines: { label: string; value: number; color: string }[] = [
    { label: "Want it", value: summary.want, color: ACTION_HEX.right },
    { label: "Seen & loved", value: summary.loved, color: ACTION_HEX.up },
    { label: "Not for me", value: summary.notForMe, color: ACTION_HEX.left },
    { label: "Seen, didn't love", value: summary.notLoved, color: ACTION_HEX.down },
  ];

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <div>
        <div className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-text-muted">
          Session complete
        </div>
        <div className="mt-2 text-[40px] font-semibold text-text-bright">
          You triaged {summary.total}
        </div>
      </div>

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

      <Link
        to="/"
        className="rounded-[5px] bg-primary px-4 py-2 font-mono text-[12px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
      >
        Back to the grid
      </Link>
    </div>
  );
}

export function TriageHeader() {
  return (
    <header className="flex h-12 items-center justify-between border-b border-border px-4">
      <div className="font-mono text-[12px] uppercase tracking-[0.18em] text-text-bright">
        Triage
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