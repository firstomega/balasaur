import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, Copy, Crown, Share2, RotateCcw } from "lucide-react";
import { TopBar } from "@/components/balasaur/TopBar";
import { DinoMark } from "@/components/balasaur/DinoMark";
import { ScoreBadge } from "@/components/balasaur/ScoreBadge";
import { AuthDialog } from "@/components/balasaur/AuthDialog";
import { buildMeta, absoluteUrl, noindexMeta } from "@/lib/seo";
import { tmdbImage } from "@/lib/tmdbImage";
import { mediaSlug } from "@/lib/slug";
import { UNIFIED_GENRES } from "@/lib/genres";
import { STREAMING_OPTIONS } from "@/types/filters";
import { useAuth } from "@/hooks/useAuth";
import { useUserStatus } from "@/hooks/useUserStatus";
import { recordForWatched, recordForWant, recordForNotInterested } from "@/lib/userStatus";
import { capturePostHogEvent } from "@/lib/posthog";
import type { MediaItem } from "@/types/media";
import { MediaCard, type QuickAction } from "@/components/balasaur/MediaCard";
import { useDeckMedia } from "@/hooks/useCatalog";
import {
  NIGHT_ERAS,
  NIGHT_LENGTHS,
  NIGHT_CROWDS,
  NIGHT_VIBES,
  fetchNightState,
  joinNightRoom,
  saveNightPrefs,
  setNightRoom,
  rollNight,
  markNightWatched,
  pickNightWinner,
  getNightToken,
  setNightToken,
  getSavedNightName,
  setSavedNightName,
  joinNightChannel,
  nightColor,
  fetchNightPreview,
  startNight,
  type NightPreview,
  type NightState,
  type NightRollItem,
  type NightSignals,
} from "@/lib/night";

// A room is private and lives 24 hours; a crawler has no business here.
export const Route = createFileRoute("/night/$code")({
  head: ({ params }) => ({
    meta: [
      ...buildMeta({
        title: "Movie Night | Balasaur",
        description: "A private room for picking what to watch together.",
        url: absoluteUrl(`/night/${params.code}`),
      }),
      noindexMeta(),
    ],
  }),
  component: NightRoomPage,
});

// ---------------------------------------------------------------------------
// Page shell: token gate, state fetching, realtime doorbell, phase switch.
// ---------------------------------------------------------------------------

function NightRoomPage() {
  const { code } = Route.useParams();
  const upper = code.toUpperCase();
  const { user } = useAuth();
  const { statuses, ready: statusesReady, recordStatus } = useUserStatus();

  // The token lives in localStorage, which the server cannot read. Reading it
  // during the first render made the server send the invite gate and the
  // browser draw the room, so every refresh flashed "You are invited" at
  // someone already in the room. It is read once, after mount, instead.
  const [token, setToken] = useState<string | null>(null);
  const [tokenRead, setTokenRead] = useState(false);
  const [state, setState] = useState<NightState | null>(null);
  const [gone, setGone] = useState(false);
  const [lost, setLost] = useState(false);
  const [online, setOnline] = useState<string[]>([]);
  const channelRef = useRef<ReturnType<typeof joinNightChannel> | null>(null);
  const submittedHistory = useRef(false);

  useEffect(() => {
    setToken(getNightToken(upper));
    setTokenRead(true);
  }, [upper]);

  const refetch = useCallback(async () => {
    if (!token) return;
    try {
      const s = await fetchNightState(upper, token);
      if (s.error === "not_found") {
        setGone(true);
        return;
      }
      // The stored token is not a member of this room: a cleared database, an
      // expired room, or a code reused. Silently retrying leaves the page on
      // "Opening the room" forever, so say so and offer the way back in.
      if (s.error === "not_member") {
        setLost(true);
        return;
      }
      if (!s.error) {
        setLost(false);
        setState(s);
      }
    } catch {
      // A throw here used to be swallowed whole, which left a first load stuck
      // on "Opening the room" with no message. Keep retrying, but only claim
      // to be lost once nothing has ever loaded.
      setState((prev) => {
        if (!prev) setLost(true);
        return prev;
      });
    }
  }, [upper, token]);

  // Realtime doorbell + presence. The channel carries no state, so a missed
  // poke costs one interval tick, nothing more.
  useEffect(() => {
    if (!token || !state?.you) return;
    const ch = joinNightChannel(upper, state.you.display_name, {
      onPoke: () => void refetch(),
      onPresence: setOnline,
    });
    channelRef.current = ch;
    return () => {
      channelRef.current = null;
      ch.leave();
    };
    // The channel keys presence on the display name; reconnect if it changes.
  }, [upper, token, state?.you?.display_name, refetch]);

  // Fetch on mount, on focus, and every 12s as the no-realtime fallback.
  useEffect(() => {
    void refetch();
    const onFocus = () => void refetch();
    window.addEventListener("focus", onFocus);
    const iv = window.setInterval(() => void refetch(), 12_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(iv);
    };
  }, [refetch]);

  // Hand the recommender what this browser already knows: what you have seen
  // (excluded for everyone) and what you want to watch (boosted). Same source
  // for guests and accounts, submitted once per visit.
  useEffect(() => {
    if (!token || !statusesReady || submittedHistory.current) return;
    submittedHistory.current = true;
    const watched = Object.entries(statuses)
      .filter(([, r]) => r.status === "seen")
      .map(([id]) => id);
    const want = Object.entries(statuses)
      .filter(([, r]) => r.status === "unseen" && r.intent === "want")
      .map(([id]) => id);
    if (watched.length === 0 && want.length === 0) return;
    void saveNightPrefs(token, { watchedIds: watched, wantIds: want }).then(() => {
      channelRef.current?.poke();
      void refetch();
    });
  }, [token, statusesReady, statuses, refetch]);

  // Every caller fires this without awaiting, so an unhandled rejection used to
  // skip the poke and the refetch and leave the tapped chip un-lit with no
  // explanation. Failure now says so and still re-syncs.
  const write = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch {
        toast("That did not save. Check your connection.", { duration: 2400 });
      }
      channelRef.current?.poke();
      await refetch();
    },
    [refetch],
  );

  if (gone) {
    return (
      <Shell>
        <div className="py-16 text-center">
          <h1 className="text-lg font-semibold text-text-bright">This room is gone</h1>
          <p className="mt-2 text-[13px] text-text-muted">
            Rooms expire after 24 hours. Start a fresh one.
          </p>
          <Link
            to="/night"
            className="mt-5 inline-block rounded-[5px] border border-primary bg-primary px-4 py-2 font-mono text-[12px] uppercase tracking-wider text-primary-foreground"
          >
            New movie night
          </Link>
        </div>
      </Shell>
    );
  }

  // Until the stored token has been read, the server and this browser must
  // agree on what to draw, so both draw the same neutral line.
  if (!tokenRead) {
    return (
      <Shell>
        <p className="py-16 text-center font-mono text-[12px] uppercase tracking-wider text-text-muted">
          Opening the room
        </p>
      </Shell>
    );
  }

  if (!token || lost) {
    return (
      <Shell>
        <JoinGate
          code={upper}
          isSignedIn={!!user}
          lost={lost}
          onJoined={(t) => {
            setNightToken(upper, t);
            setToken(t);
            setLost(false);
          }}
        />
      </Shell>
    );
  }

  if (!state) {
    return (
      <Shell>
        <p className="py-16 text-center font-mono text-[12px] uppercase tracking-wider text-text-muted">
          Opening the room
        </p>
      </Shell>
    );
  }

  const revealPending =
    state.room.reveal_at !== null && new Date(state.room.reveal_at).getTime() > Date.now();

  return (
    <Shell>
      <RoomHeader state={state} online={online} />
      {revealPending ? (
        <Calculating state={state} onDone={() => void refetch()} />
      ) : state.room.status === "results" && state.roll ? (
        <Results
          state={state}
          token={token}
          isSignedIn={!!user}
          write={write}
          recordStatus={recordStatus}
        />
      ) : null}
      {/* A group room gathers before it asks anything. Answering alone while
          the others are still arriving was the whole complaint, so the wizard
          is not mounted until the room has started. Solo rooms never wait. */}
      {state.room.mode === "group" && !state.room.started_at ? (
        <Lobby state={state} token={token} write={write} />
      ) : (
        <Wizard
          state={state}
          token={token}
          write={write}
          collapsed={state.room.status === "results"}
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Join gate: arrived via a shared link without a membership in this browser.
// ---------------------------------------------------------------------------

function JoinGate({
  code,
  isSignedIn,
  lost = false,
  onJoined,
}: {
  code: string;
  isSignedIn: boolean;
  lost?: boolean;
  onJoined: (token: string) => void;
}) {
  const [name, setName] = useState(() => getSavedNightName());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await joinNightRoom({ code, displayName: name, isSignedIn });
      if (res.error === "not_found") {
        setError("This room does not exist or has expired.");
        return;
      }
      if (res.error === "solo_room") {
        setError("This is someone's solo session, so it cannot be joined.");
        return;
      }
      if (res.error === "room_full") {
        setError("This room is full (8 people max).");
        return;
      }
      if (res.error || !res.member_token) {
        setError("Could not join. Try again.");
        return;
      }
      if (name.trim()) setSavedNightName(name.trim());
      capturePostHogEvent("night_member_joined", { via: "link" });
      onJoined(res.member_token);
    } catch {
      setError("Could not join. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm py-10">
      <div className="mb-5 flex items-center gap-2.5">
        <DinoMark className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-[17px] font-semibold text-text-bright">
            {lost ? "Back in you go" : "You are invited"}
          </h1>
          <p className="text-[13px] text-text-muted">
            Room <span className="font-mono tracking-widest text-text-bright">{code}</span>.{" "}
            {lost
              ? "Your spot in this room expired. Rejoin with a name."
              : "Pick a name and jump in."}
          </p>
        </div>
      </div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Anonymous Raptor"
        maxLength={24}
        className="w-full rounded-[5px] border border-border bg-panel px-3 py-2 text-[14px] text-text-bright placeholder:text-text-dim focus:border-primary focus:outline-none"
      />
      {error && <p className="mt-2 text-[13px] text-[#e08aa4]">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => void join()}
        className="mt-3 w-full cursor-pointer rounded-[5px] border border-primary bg-primary px-3 py-2.5 font-mono text-[12px] font-medium uppercase tracking-wider text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {busy ? "One moment" : "Join the room"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header: code, share, and the people. Colored dots are stable per join
// order; the same colors ring the genre chips below, so "who picked this"
// reads without labels.
// ---------------------------------------------------------------------------

function RoomHeader({ state, online }: { state: NightState; online: string[] }) {
  const { room, members } = state;
  const url = typeof window !== "undefined" ? `${window.location.origin}/night/${room.code}` : "";

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Movie Night on Balasaur", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", { duration: 1600 });
    } catch {
      // user dismissed the share sheet; nothing to do
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      toast.success("Code copied", { duration: 1600 });
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div className="mb-4 rounded-[6px] border border-border bg-panel p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <DinoMark className="h-5 w-5 text-primary" />
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
            {room.mode === "solo" ? "Solo pick" : "Movie night"}
          </span>
          {room.mode === "group" && (
            <button
              type="button"
              onClick={() => void copyCode()}
              title="Copy the room code"
              className="cursor-pointer rounded-[4px] border border-border-strong bg-background px-2 py-0.5 font-mono text-[13px] tracking-[0.3em] text-text-bright hover:border-primary"
            >
              {room.code}
              <Copy className="ml-1.5 inline h-3 w-3 text-text-dim" />
            </button>
          )}
        </div>
        {room.mode === "group" && (
          <button
            type="button"
            onClick={() => void share()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-[5px] border border-border-strong bg-background px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-text-bright hover:border-primary hover:text-primary"
          >
            <Share2 className="h-3.5 w-3.5" />
            Invite
          </button>
        )}
      </div>

      {room.mode === "group" && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {members.map((m, i) => (
            <span
              key={`${m.display_name}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-1 text-[11.5px] text-text-bright"
            >
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: nightColor(i),
                  opacity: online.includes(m.display_name) ? 1 : 0.35,
                }}
              />
              {m.display_name}
              {m.is_you && <span className="text-text-dim">(you)</span>}
              {m.is_host && <Crown className="h-3 w-3 text-[#e8b84b]" aria-label="Host" />}
              {m.ready && <Check className="h-3 w-3 text-[#9fe6a0]" aria-label="Ready" />}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The lobby. Nobody answers questions until the room is assembled, and the
// wait is spent on something that pays: marking what you have already seen.
// That is not busywork dressed up. night_recommend excludes every member's
// watched titles from the room's pool and gives "want to watch" the heaviest
// term in its ranking, so a minute spent here visibly sharpens tonight's pick
// and fills in a profile that outlives the room.
// ---------------------------------------------------------------------------

function Lobby({
  state,
  token,
  write,
}: {
  state: NightState;
  token: string;
  write: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const { you, members, room } = state;
  const { statuses, recordStatus } = useUserStatus();
  const [starting, setStarting] = useState(false);
  const readyCount = members.filter((m) => m.ready).length;
  // Three minutes after the room opened anyone can start it. A host who shut
  // the tab costs the room a wait, never the night.
  const [canForce, setCanForce] = useState(false);
  useEffect(() => {
    const at = Date.parse(room.created_at) + 3 * 60 * 1000;
    if (Date.now() >= at) {
      setCanForce(true);
      return;
    }
    const t = window.setTimeout(() => setCanForce(true), at - Date.now());
    return () => window.clearTimeout(t);
  }, [room.created_at]);

  const everyoneReady = members.length >= 2 && readyCount === members.length;
  const mayStart = you.is_host || everyoneReady || canForce;

  const start = async () => {
    setStarting(true);
    try {
      await write(async () => {
        const res = await startNight(token);
        if (res.error === "not_yet") toast("Not everyone is in yet.", { duration: 1800 });
        else if (res.error) toast("Could not start. Try again.", { duration: 2000 });
        else capturePostHogEvent("night_started", { members: members.length });
      });
    } finally {
      setStarting(false);
    }
  };

  const onAction = (item: MediaItem, action: QuickAction) => {
    if (action === "watched") {
      recordStatus(item.id, recordForWatched(statuses[item.id]), item);
      // The room needs to know too, or tonight's pool still contains it.
      void write(() => markNightWatched(token, item.id));
    } else if (action === "want") {
      recordStatus(item.id, recordForWant(), item);
    } else {
      recordStatus(item.id, recordForNotInterested(), item);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-[6px] border border-border bg-panel p-3.5">
        <div className="min-w-0">
          <p className="text-[14px] text-text-bright">
            {members.length === 1
              ? "Waiting for the room to fill."
              : `${members.length} here${readyCount > 0 ? `, ${readyCount} ready` : ""}.`}
          </p>
          {!mayStart && (
            <p className="mt-0.5 text-[12.5px] text-text-dim">The host starts the questions.</p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!you.is_host && (
            <button
              type="button"
              onClick={() => void write(() => saveNightPrefs(token, { ready: !you.ready }))}
              className={`cursor-pointer rounded-[5px] border px-3 py-2 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                you.ready
                  ? "border-[#9fe6a0] bg-[#9fe6a0]/10 text-[#9fe6a0]"
                  : "border-border-strong bg-background text-text-bright hover:border-primary"
              }`}
            >
              {you.ready ? "Ready" : "I am ready"}
            </button>
          )}
          {mayStart && (
            <button
              type="button"
              disabled={starting}
              onClick={() => void start()}
              className="cursor-pointer rounded-[5px] border border-primary bg-primary px-4 py-2 font-mono text-[12px] font-medium uppercase tracking-wider text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {starting ? "Starting" : "Start the questions"}
            </button>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[13px] text-text-muted">
          Seen one? Mark it while you wait. Anything the room has seen drops out of tonight&apos;s
          picks.
        </p>
        <Suspense
          fallback={
            <div className="h-64 animate-pulse rounded-[6px] border border-border bg-panel" />
          }
        >
          <LobbyDeck mediaType={room.media_type} statuses={statuses} onAction={onAction} />
        </Suspense>
      </div>
    </div>
  );
}

/** A grid, not a swipe deck: "quickly mark a few" is a scan-and-tap job, and
 *  MediaCard already carries the three actions this needs. */
function LobbyDeck({
  mediaType,
  statuses,
  onAction,
}: {
  mediaType: string;
  statuses: Record<string, { status?: string } | undefined>;
  onAction: (item: MediaItem, action: QuickAction) => void;
}) {
  const { data } = useDeckMedia("US", "");
  const items = (data ?? [])
    .filter((m) => (mediaType === "either" ? true : m.mediaType === mediaType))
    .filter((m) => !statuses[m.id])
    .slice(0, 12);
  if (items.length === 0) {
    return (
      <p className="text-[13px] text-text-dim">Nothing left to file. You are all caught up.</p>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
      {items.map((item) => (
        <MediaCard key={item.id} item={item} onQuickAction={onAction} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The wizard. One question per screen now, not a wall of forty chips. Mood
// answers re-rank the pool, the hard room facts shrink it, and the footer
// carries the two facts that make answering worth it: how many titles are
// still in play, and the exact title the deal would lead with right now.
// The rings still show what everyone else picked, live.
// ---------------------------------------------------------------------------

function Wizard({
  state,
  token,
  write,
  collapsed,
}: {
  state: NightState;
  token: string;
  write: (fn: () => Promise<unknown>) => Promise<void>;
  collapsed: boolean;
}) {
  const { you, members, room } = state;
  const hasAnswered =
    you.genres_want.length > 0 ||
    you.genres_less.length > 0 ||
    Object.keys(you.signals ?? {}).length > 0;
  const [open, setOpen] = useState(!collapsed || !hasAnswered);
  useEffect(() => {
    if (collapsed && hasAnswered) setOpen(false);
  }, [collapsed, hasAnswered]);

  // One question per screen. "length" only exists where runtime does.
  const steps = useMemo(() => {
    const list: {
      key: "mood" | "era" | "length" | "crowd" | "vibe" | "ready";
      q: string;
      hint?: string;
    }[] = [
      { key: "mood", q: "Tonight feels like?", hint: "Up to three. Skip if anything goes." },
      { key: "era", q: "From when?" },
    ];
    if (room.media_type !== "tv") list.push({ key: "length", q: "How long have you got?" });
    list.push({ key: "crowd", q: "Something everyone knows, or a deep cut?" });
    list.push({ key: "vibe", q: "What kind of night is it?" });
    list.push({ key: "ready", q: room.mode === "group" ? "Lock it in" : "Deal the hand" });
    return list;
  }, [room.media_type, room.mode]);
  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[Math.min(stepIdx, steps.length - 1)];

  // The needle. Refetched whenever the room state moves (any member's answer
  // taps the doorbell, which refetches state, which lands here).
  const [preview, setPreview] = useState<NightPreview | null>(null);
  useEffect(() => {
    let dead = false;
    fetchNightPreview(token)
      .then((pv) => {
        if (!dead && !pv.error) setPreview(pv);
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [token, state]);

  const others = members.map((m, i) => ({ ...m, seat: i })).filter((m) => !m.is_you);
  const ringsFor = (genre: string, list: "genres_want" | "genres_less") =>
    others.filter((m) => m[list].includes(genre)).map((m) => nightColor(m.seat));

  const toggleGenre = (genre: string) => {
    const current = you.genres_want;
    let next: string[];
    if (current.includes(genre)) {
      next = current.filter((g) => g !== genre);
    } else {
      if (current.length >= 3) {
        toast("Three at most. Unpick one first.", { duration: 1800 });
        return;
      }
      next = [...current, genre];
    }
    void write(() => saveNightPrefs(token, { genresWant: next }));
  };

  const setSignal = (key: keyof NightSignals, value: string) => {
    const clearing = you.signals[key] === value;
    void write(() => saveNightPrefs(token, { signals: { [key]: clearing ? null : value } }));
  };

  const setReady = (ready: boolean) => {
    void write(() => saveNightPrefs(token, { ready }));
    if (ready) capturePostHogEvent("night_prefs_ready", { mode: room.mode });
  };

  const answered =
    members.reduce(
      (n, m) =>
        n + m.genres_want.length + m.genres_less.length + Object.keys(m.signals ?? {}).length,
      0,
    ) ?? 0;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setStepIdx(0);
          setOpen(true);
        }}
        className="mb-4 w-full cursor-pointer rounded-[6px] border border-border bg-panel px-3 py-2.5 text-left font-mono text-[11px] uppercase tracking-wider text-text-muted hover:border-border-strong hover:text-text-bright"
      >
        Adjust answers, then deal again
      </button>
    );
  }

  const chipBase =
    "relative cursor-pointer rounded-[5px] border px-3 py-2 font-mono text-[11px] uppercase tracking-wider transition-colors";

  const optionChip = (props: {
    id: string;
    label: string;
    mine: boolean;
    rings: string[];
    onClick: () => void;
  }) => (
    <button
      key={props.id}
      type="button"
      aria-pressed={props.mine}
      onClick={props.onClick}
      className={`${chipBase} ${
        props.mine
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-background text-text-bright hover:border-border-strong"
      }`}
    >
      {props.label}
      {props.rings.length > 0 && (
        <span className="absolute -right-1 -top-1 flex gap-0.5">
          {props.rings.slice(0, 4).map((c, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-full border border-background"
              style={{ backgroundColor: c }}
            />
          ))}
        </span>
      )}
    </button>
  );

  const signalOptions = (key: "era" | "length" | "crowd" | "vibe") => {
    const options =
      key === "era"
        ? NIGHT_ERAS
        : key === "length"
          ? NIGHT_LENGTHS
          : key === "crowd"
            ? NIGHT_CROWDS
            : NIGHT_VIBES;
    return (
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) =>
          optionChip({
            id: o.value,
            label: o.label,
            mine: you.signals[key] === o.value,
            rings: others
              .filter((m) => m.signals?.[key] === o.value)
              .map((m) => nightColor(m.seat)),
            onClick: () => setSignal(key, o.value),
          }),
        )}
      </div>
    );
  };

  const stepAnswered =
    step.key === "mood"
      ? you.genres_want.length > 0
      : step.key === "ready"
        ? true
        : !!you.signals[step.key];

  const yourAnswers: string[] = [
    ...you.genres_want,
    ...(["era", "length", "crowd", "vibe"] as const).flatMap((k) => {
      const v = you.signals[k];
      if (!v) return [];
      const all = [...NIGHT_ERAS, ...NIGHT_LENGTHS, ...NIGHT_CROWDS, ...NIGHT_VIBES];
      const hit = all.find((o) => o.value === v);
      return hit ? [hit.label] : [];
    }),
  ];

  return (
    <div className="space-y-4 rounded-[6px] border border-border bg-panel p-4">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
          {stepIdx + 1} of {steps.length}
        </span>
        {stepIdx > 0 && (
          <button
            type="button"
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
            className="cursor-pointer font-mono text-[11px] uppercase tracking-wider text-text-muted hover:text-text-bright"
          >
            Back
          </button>
        )}
      </div>

      <div>
        <h2 className="text-[18px] font-semibold leading-tight text-text-bright">{step.q}</h2>
        {step.hint && <p className="mt-1 text-[12.5px] text-text-dim">{step.hint}</p>}
      </div>

      {step.key === "mood" && (
        <div className="flex flex-wrap gap-1.5">
          {UNIFIED_GENRES.map((g) =>
            optionChip({
              id: g,
              label: g,
              mine: you.genres_want.includes(g),
              rings: ringsFor(g, "genres_want"),
              onClick: () => toggleGenre(g),
            }),
          )}
        </div>
      )}
      {(step.key === "era" ||
        step.key === "length" ||
        step.key === "crowd" ||
        step.key === "vibe") &&
        signalOptions(step.key)}

      {step.key === "ready" && (
        <div className="space-y-4">
          {yourAnswers.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {yourAnswers.map((a) => (
                <span
                  key={a}
                  className="rounded-[4px] border border-primary/40 bg-primary/10 px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-primary"
                >
                  {a}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-text-muted">
              No answers. The deal leads with the highest scores in play.
            </p>
          )}
          {you.is_host && <HostControls state={state} token={token} write={write} />}
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            {room.mode === "group" ? (
              <button
                type="button"
                onClick={() => setReady(!you.ready)}
                className={`cursor-pointer rounded-[5px] border px-3 py-2 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                  you.ready
                    ? "border-[#9fe6a0] bg-[#9fe6a0]/10 text-[#9fe6a0]"
                    : "border-border-strong bg-background text-text-bright hover:border-primary"
                }`}
              >
                {you.ready ? "Ready" : "I am ready"}
              </button>
            ) : (
              <span className="text-[11.5px] text-text-dim">
                {answered} answers shaping this deal
              </span>
            )}
            <RollButton
              state={state}
              token={token}
              write={write}
              answered={answered}
              pool={preview?.pool ?? null}
            />
          </div>
        </div>
      )}

      {step.key !== "ready" && (
        <button
          type="button"
          onClick={() => setStepIdx((i) => Math.min(steps.length - 1, i + 1))}
          className="w-full cursor-pointer rounded-[5px] border border-primary bg-primary px-4 py-2.5 text-center text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
        >
          {stepAnswered ? "Next" : "Skip"}
        </button>
      )}

      {preview && (
        <p className="border-t border-border pt-3 font-mono text-[11px] uppercase tracking-wider text-text-muted">
          <span className="text-text-bright">{preview.pool.toLocaleString("en-US")}</span> in play
          {preview.front && (
            <>
              {" "}
              · Front of the deck: {preview.front.title}
              {typeof preview.front.score === "number" ? ` · ${preview.front.score}` : ""}
            </>
          )}
        </p>
      )}
    </div>
  );
}

function HostControls({
  state,
  token,
  write,
}: {
  state: NightState;
  token: string;
  write: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const { room } = state;
  const chip = (active: boolean) =>
    `cursor-pointer rounded-[5px] border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
      active
        ? "border-primary bg-primary/15 text-primary"
        : "border-border bg-background text-text-muted hover:border-border-strong"
    }`;
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <p className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
        Room settings (host)
      </p>
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["movie", "Movies"],
            ["tv", "TV"],
            ["either", "Either"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => void write(() => setNightRoom(token, { mediaType: v }))}
            className={chip(room.media_type === v)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {STREAMING_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() =>
              void write(() =>
                setNightRoom(token, {
                  services: room.services.includes(s)
                    ? room.services.filter((x) => x !== s)
                    : [...room.services, s],
                }),
              )
            }
            className={chip(room.services.includes(s))}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function RollButton({
  state,
  token,
  write,
  answered,
  pool,
}: {
  state: NightState;
  token: string;
  write: (fn: () => Promise<unknown>) => Promise<void>;
  answered: number;
  pool: number | null;
}) {
  const { you, room, members } = state;
  const [busy, setBusy] = useState(false);
  const readyCount = members.filter((m) => m.ready).length;

  if (!you.is_host) {
    return (
      <span className="text-[11.5px] text-text-dim">
        {readyCount} of {members.length} ready. The host rolls.
      </span>
    );
  }

  const roll = async () => {
    setBusy(true);
    try {
      await write(async () => {
        const res = await rollNight(token, {
          delaySeconds: room.mode === "solo" ? 2 : 4,
        });
        if (res.error === "reveal_pending") {
          toast("The reveal is still running.", { duration: 1800 });
        } else if (res.error === "roll_limit") {
          toast("That is a lot of rolls. Start a fresh room.", { duration: 2400 });
        } else if (res.error === "host_only") {
          toast("Only the host can roll.", { duration: 2000 });
        } else if (res.error) {
          // not_member and anything else the server grows later. Silence here
          // just re-enabled the button and looked broken.
          toast("Could not roll. Try again.", { duration: 2000 });
        } else {
          capturePostHogEvent("night_rolled", {
            mode: room.mode,
            roll_seq: res.roll_seq,
            answers: answered,
            members: members.length,
          });
        }
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void roll()}
      className="cursor-pointer rounded-[5px] border border-primary bg-primary px-4 py-2 font-mono text-[12px] font-medium uppercase tracking-wider text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
    >
      {room.roll_seq > 0
        ? "Deal again"
        : pool
          ? `Deal from ${pool.toLocaleString("en-US")}`
          : room.mode === "solo"
            ? "Deal my hand"
            : "Deal the hand"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// The reveal. The server stamped reveal_at a few seconds out; every phone
// animates until that moment and flips together. The delay is the sync.
// ---------------------------------------------------------------------------

const CALC_LINES = [
  "Reading 74,000 titles",
  "Blending four rating sources",
  "Excluding what you have seen",
  "Weighing everyone's answers",
  "Settling the arguments",
];

function Calculating({ state, onDone }: { state: NightState; onDone: () => void }) {
  const [line, setLine] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    const lineTimer = window.setInterval(() => setLine((l) => (l + 1) % CALC_LINES.length), 900);
    // reveal_at is the server's clock; this is the phone's. A phone running
    // behind would animate for the whole difference while everyone else is
    // already looking at the picks, so the wait is capped locally.
    const at = state.room.reveal_at ? new Date(state.room.reveal_at).getTime() : 0;
    const deadline = Date.now() + Math.min(Math.max(at - Date.now(), 0), 12_000);
    const tick = window.setInterval(() => {
      if (!doneRef.current && Date.now() >= deadline) {
        doneRef.current = true;
        onDone();
      }
    }, 200);
    return () => {
      window.clearInterval(lineTimer);
      window.clearInterval(tick);
    };
  }, [state.room.reveal_at, onDone]);

  return (
    <div className="mb-4 rounded-[6px] border border-border bg-panel px-4 py-12 text-center">
      <DinoMark className="mx-auto h-10 w-10 animate-pulse text-primary" />
      <p
        role="status"
        className="mt-4 font-mono text-[12px] uppercase tracking-wider text-text-muted"
      >
        {CALC_LINES[line]}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results: the picks, why each one is here, and what to do about it.
// ---------------------------------------------------------------------------

function Results({
  state,
  token,
  isSignedIn,
  write,
  recordStatus,
}: {
  state: NightState;
  token: string;
  isSignedIn: boolean;
  write: (fn: () => Promise<unknown>) => Promise<void>;
  recordStatus: (id: string, record: ReturnType<typeof recordForWatched>, item?: MediaItem) => void;
}) {
  const { room, roll } = state;
  const solo = room.mode === "solo";
  const [authOpen, setAuthOpen] = useState(false);
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const nudgeShown = useRef(false);

  useEffect(() => {
    if (!isSignedIn && !nudgeShown.current) {
      nudgeShown.current = true;
      capturePostHogEvent("night_signup_nudge_shown", {});
    }
  }, [isSignedIn]);

  const items = useMemo(() => roll?.items ?? [], [roll]);
  if (!roll) return null;

  const winner = items.find((i) => i.media_id === room.winner_media_id);

  const markSeen = (item: NightRollItem) => {
    setSeenIds((s) => [...s, item.media_id]);
    // Feed both stores: the room (so the next re-roll skips it for everyone)
    // and this browser's own history (guest localStorage or account).
    recordStatus(item.media_id, recordForWatched(), {
      id: item.media_id,
      mediaType: item.media_type,
      title: item.title,
      posterUrl: item.poster_url ?? undefined,
      year: item.year ?? undefined,
    } as unknown as MediaItem);
    capturePostHogEvent("night_marked_watched", {});
    void write(() => markNightWatched(token, item.media_id));
    toast("Noted. A re-roll will skip it.", { duration: 1800 });
  };

  const pick = (item: NightRollItem) => {
    capturePostHogEvent("night_winner_picked", { match: item.match });
    void write(() => pickNightWinner(token, item.media_id));
  };

  return (
    <div className="mb-4 space-y-3">
      {winner && (
        <div className="rounded-[6px] border border-[#9fe6a0]/60 bg-[#9fe6a0]/10 px-4 py-3">
          <p className="text-[13.5px] text-text-bright">
            Tonight: <span className="font-semibold">{winner.title}</span>
            {/* Naming the picker only means something when there is more than
                one person who could have picked. */}
            {!solo && <span className="text-text-muted"> picked by {room.winner_name}</span>}
          </p>
        </div>
      )}

      {/* The recommender can legitimately come back empty: a narrow service
          list plus a media type plus everything already rolled. Without this
          the reveal lands on a blank gap. */}
      {items.length === 0 && (
        <div className="rounded-[6px] border border-border bg-panel px-4 py-6 text-center">
          <p className="text-[13px] text-text-bright">Nothing left that fits.</p>
          <p className="mt-1 text-[13px] text-text-muted">
            {room.services.length > 0
              ? "Widen the services or the type above, then roll again."
              : "Widen the type above, then roll again."}
          </p>
        </div>
      )}

      {items.map((item) => (
        <ResultCard
          key={item.media_id}
          item={item}
          solo={solo}
          isWinner={item.media_id === room.winner_media_id}
          seen={seenIds.includes(item.media_id)}
          onSeen={() => markSeen(item)}
          onPick={() => pick(item)}
        />
      ))}

      {!isSignedIn && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-border bg-panel px-4 py-3">
          <p className="text-[13px] text-text-muted">
            Keep tonight's pick and everything you marked.
          </p>
          <button
            type="button"
            onClick={() => setAuthOpen(true)}
            className="cursor-pointer rounded-[5px] border border-primary bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
          >
            Create an account
          </button>
        </div>
      )}
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </div>
  );
}

function ResultCard({
  item,
  solo,
  isWinner,
  seen,
  onSeen,
  onPick,
}: {
  item: NightRollItem;
  solo: boolean;
  isWinner: boolean;
  seen: boolean;
  onSeen: () => void;
  onPick: () => void;
}) {
  const slug = mediaSlug(item.media_id.replace(/^(movie|tv)-/, ""), item.title);
  const href = `/${item.media_type === "tv" ? "tv" : "movie"}/${slug}`;
  const r = item.reasons;

  // The reasons come back keyed by member name, which is the right shape for a
  // room and the wrong one for a person sitting alone: "on Anonymous Raptor's
  // watchlist" is nobody's idea of a reason. Solo says "you".
  const chips: { text: string; tone: "want" | "info" | "held" }[] = [];
  if (r.wanted_by.length > 0) {
    chips.push({
      text: solo ? "On your watchlist" : `On ${r.wanted_by.join(" and ")}'s watchlist`,
      tone: "want",
    });
  }
  for (const g of r.genres.slice(0, 2)) {
    chips.push({
      text: solo ? `${g.genre}, for you` : `${g.genre}, for ${g.members.join(" and ")}`,
      tone: "info",
    });
  }
  for (const h of r.held_back.slice(0, 1)) {
    chips.push({
      text: solo
        ? `${h.genre}, which you preferred less`
        : `${h.genre}, which ${h.count === 1 ? "one of you" : `${h.count} of you`} preferred less`,
      tone: "held",
    });
  }
  for (const v of r.signals.vibes.slice(0, 1)) {
    const label = NIGHT_VIBES.find((x) => x.value === v)?.label;
    if (label) chips.push({ text: label, tone: "info" });
  }

  return (
    <div
      className={`flex gap-3 rounded-[6px] border bg-panel p-3 ${
        isWinner ? "border-[#9fe6a0]/60" : "border-border"
      }`}
    >
      <a href={href} target="_blank" rel="noopener" className="shrink-0">
        {item.poster_url ? (
          <img
            src={tmdbImage(item.poster_url, "w185")}
            alt={`${item.title} poster`}
            width={92}
            height={138}
            loading="lazy"
            className="h-[138px] w-[92px] rounded-[4px] object-cover"
          />
        ) : (
          <div className="flex h-[138px] w-[92px] items-center justify-center rounded-[4px] bg-background font-mono text-[11px] uppercase text-text-dim">
            No art
          </div>
        )}
      </a>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <a href={href} target="_blank" rel="noopener" className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold leading-tight text-text-bright hover:underline">
              {item.title}
            </h3>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-text-muted">
              {item.media_type === "tv" ? "TV" : "Movie"}
              {item.year ? ` · ${item.year}` : ""}
              {item.runtime ? ` · ${item.runtime}m` : ""}
            </p>
          </a>
          {typeof item.score === "number" && <ScoreBadge score={item.score} size="sm" />}
        </div>

        <div className="mt-1.5 flex flex-wrap gap-1">
          {chips.map((c, i) => (
            <span
              key={i}
              className={`rounded-[4px] border px-1.5 py-0.5 text-[12px] ${
                c.tone === "want"
                  ? "border-[#9fe6a0]/50 text-[#9fe6a0]"
                  : c.tone === "held"
                    ? "border-[#e08aa4]/50 text-[#e08aa4]"
                    : "border-border text-text-muted"
              }`}
            >
              {c.text}
            </span>
          ))}
          {item.streaming.length > 0 && (
            <span className="rounded-[4px] border border-border px-1.5 py-0.5 text-[12px] text-text-muted">
              On {item.streaming.slice(0, 3).join(", ")}
            </span>
          )}
        </div>

        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            onClick={onPick}
            disabled={isWinner}
            className="cursor-pointer rounded-[4px] border border-primary/70 px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-primary hover:bg-primary/10 disabled:cursor-default disabled:opacity-50"
          >
            {isWinner ? "Tonight's pick" : "Pick this"}
          </button>
          <button
            type="button"
            onClick={onSeen}
            disabled={seen}
            className="inline-flex cursor-pointer items-center gap-1 rounded-[4px] border border-border px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-text-muted hover:border-border-strong hover:text-text-bright disabled:cursor-default disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" />
            {seen ? "Marked seen" : "Seen it"}
          </button>
        </div>
      </div>
    </div>
  );
}
