import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { buildMeta, canonicalLink, absoluteUrl, noindexMeta } from "@/lib/seo";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useMyProfile";
import { STREAMING_OPTIONS } from "@/types/filters";
import {
  createNightRoom,
  joinNightRoom,
  setNightToken,
  getSavedNightName,
  setSavedNightName,
} from "@/lib/night";
import { capturePostHogEvent } from "@/lib/posthog";
import { DinoMark } from "@/components/balasaur/DinoMark";

// Movie Night entry. Rooms are private and ephemeral, so everything under
// /night carries noindex: a crawler has no business in someone's lobby, and
// the crawl budget this site fought for should not be spent here.
//
// This is an INDEX route ("/night/"), not "/night". The room lives at
// /night/$code, which makes /night its parent; a parent route renders its
// child inside an <Outlet />. As a plain "/night" route this component had no
// outlet, so opening a room changed the URL and rendered this page again.
export const Route = createFileRoute("/night/")({
  head: () => {
    const url = absoluteUrl("/night");
    return {
      meta: [
        ...buildMeta({
          title: "Movie Night | Balasaur",
          description:
            "Pick together. Everyone answers a few questions on their own phone and one recommendation comes back for the room.",
          url,
        }),
        noindexMeta(),
      ],
      links: [canonicalLink(url)],
    };
  },
  component: NightEntry,
});

type Path = "solo" | "group" | "join";

function NightEntry() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: me } = useMyProfile();
  const [path, setPath] = useState<Path | null>(null);
  const [name, setName] = useState(() => getSavedNightName());
  const [mediaType, setMediaType] = useState<"movie" | "tv" | "either">("either");
  const [services, setServices] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveName = name.trim() || me?.username || "";

  const start = async (mode: "solo" | "group") => {
    setBusy(true);
    setError(null);
    try {
      const res = await createNightRoom({
        displayName: effectiveName,
        mode,
        mediaType,
        services,
        isSignedIn: !!user,
      });
      if (res.error || !res.state?.room) {
        setError("Could not start a room. Try again.");
        return;
      }
      if (name.trim()) setSavedNightName(name.trim());
      setNightToken(res.state.room.code, res.member_token);
      capturePostHogEvent("night_room_created", { mode, media_type: mediaType });
      void navigate({ to: "/night/$code", params: { code: res.state.room.code } });
    } catch {
      setError("Could not start a room. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    const c = code.trim().toUpperCase();
    if (c.length < 4) {
      setError("That code looks too short.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await joinNightRoom({
        code: c,
        displayName: effectiveName,
        isSignedIn: !!user,
      });
      if (res.error === "not_found") {
        setError("No room with that code. Codes expire after 24 hours.");
        return;
      }
      if (res.error === "solo_room") {
        setError("That room is a solo session.");
        return;
      }
      if (res.error === "room_full") {
        setError("That room is full (8 people max).");
        return;
      }
      if (res.error || !res.state?.room) {
        setError("Could not join. Try again.");
        return;
      }
      if (name.trim()) setSavedNightName(name.trim());
      setNightToken(c, res.member_token);
      capturePostHogEvent("night_member_joined", { via: "code" });
      void navigate({ to: "/night/$code", params: { code: c } });
    } catch {
      setError("Could not join. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const forkButton = (p: Path, title: string, sub: string) => (
    <button
      type="button"
      onClick={() => {
        setPath(p);
        setError(null);
      }}
      className={`flex-1 cursor-pointer rounded-[6px] border p-4 text-left transition-colors ${
        path === p
          ? "border-primary bg-primary/10"
          : "border-border bg-panel hover:border-border-strong"
      }`}
    >
      <div className="font-mono text-[13px] font-semibold uppercase tracking-wider text-text-bright">
        {title}
      </div>
      <div className="mt-1 text-[12.5px] leading-snug text-text-muted">{sub}</div>
    </button>
  );

  const chip = (active: boolean) =>
    `cursor-pointer rounded-[5px] border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
      active
        ? "border-primary bg-primary/15 text-primary"
        : "border-border bg-background text-text-bright hover:border-border-strong"
    }`;

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <main className="mx-auto max-w-lg px-4 py-8">
        <div className="mb-6 flex items-center gap-2.5">
          <DinoMark className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-[20px] font-semibold leading-tight text-text-bright">
              Movie Night
            </h1>
            <p className="text-[13px] text-text-muted">
              Answer a few questions, get something to watch.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          {forkButton("solo", "Just me", "A smart pick for one.")}
          {forkButton("group", "With friends", "Everyone joins from their own phone.")}
          {forkButton("join", "I have a code", "Someone sent you here.")}
        </div>

        {path && (
          <div className="mt-5 space-y-5 rounded-[6px] border border-border bg-panel p-4">
            {/* Solo has no room to be named in, so it does not ask. */}
            {path !== "solo" && (
              <label className="block">
                <span className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-wider text-text-muted">
                  Your name in the room
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={me?.username || "Anonymous Raptor"}
                  maxLength={24}
                  className="w-full rounded-[5px] border border-border bg-background px-3 py-2 text-[14px] text-text-bright placeholder:text-text-dim focus:border-primary focus:outline-none"
                />
              </label>
            )}

            {path === "join" ? (
              <label className="block">
                <span className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-wider text-text-muted">
                  Room code
                </span>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABCDE"
                  maxLength={5}
                  autoCapitalize="characters"
                  className="w-full rounded-[5px] border border-border bg-background px-3 py-2 font-mono text-[18px] tracking-[0.35em] text-text-bright placeholder:text-text-dim focus:border-primary focus:outline-none"
                />
              </label>
            ) : (
              <>
                <div>
                  <span className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-wider text-text-muted">
                    Watching
                  </span>
                  <div className="flex gap-2">
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
                        onClick={() => setMediaType(v)}
                        className={chip(mediaType === v)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-wider text-text-muted">
                    Services you can watch on (optional)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {STREAMING_OPTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() =>
                          setServices((prev) =>
                            prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                          )
                        }
                        className={chip(services.includes(s))}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11.5px] text-text-dim">
                    Pick some and every recommendation will be watchable tonight.
                  </p>
                </div>
              </>
            )}

            {error && <p className="text-[12.5px] text-[#e08aa4]">{error}</p>}

            <button
              type="button"
              disabled={busy}
              onClick={() => (path === "join" ? void join() : void start(path))}
              className="w-full cursor-pointer rounded-[5px] border border-primary bg-primary px-3 py-2.5 font-mono text-[12px] font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-default disabled:opacity-60"
            >
              {busy
                ? "One moment"
                : path === "join"
                  ? "Join the room"
                  : path === "solo"
                    ? "Find my pick"
                    : "Open the room"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
