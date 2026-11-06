import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { buildMeta, canonicalLink, absoluteUrl, noindexMeta } from "@/lib/seo";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useMyProfile";
import { createNightRoom, setNightToken, getSavedNightName, setSavedNightName } from "@/lib/night";
import { capturePostHogEvent } from "@/lib/posthog";

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

function NightEntry() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: me } = useMyProfile();
  const [name, setName] = useState(() => getSavedNightName());
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
        // Rooms start on movies with no service filter. Both live in the room
        // now, beside the in-play count that shows what changing them did;
        // asking someone to filter a catalog before they have seen a single
        // poster was two screens of setup ahead of the fun.
        mediaType: "movie",
        services: [],
        isSignedIn: !!user,
      });
      if (res.error || !res.state?.room) {
        setError("Could not start a room. Try again.");
        return;
      }
      if (name.trim()) setSavedNightName(name.trim());
      setNightToken(res.state.room.code, res.member_token);
      capturePostHogEvent("night_room_created", { mode });
      void navigate({ to: "/night/$code", params: { code: res.state.room.code } });
    } catch {
      setError("Could not start a room. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // The root layout draws the footer. This page drew a second one of its own,
  // so the attribution printed twice, one copy under the cookie banner.
  return (
    <div className="bg-background text-foreground">
      <main id="main" className="mx-auto w-full max-w-[560px] px-4 pb-16 pt-6 md:pt-9">
        <h1 className="font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-text-bright md:text-[64px]">
          Movie Night
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-text-muted">
          Everyone answers a few questions on their own phone, and one title comes back for the
          room.
        </p>

        {/* Two real choices with real weight, and the code as a line rather
            than a third identical box. The old page made you pick a path and
            THEN revealed a form, which was two taps to reach one field. */}
        <div className="mt-6 space-y-3 md:mt-8">
          <div className="rounded-2xl bg-panel p-4 sm:p-5">
            <h2 className="font-display text-2xl font-extrabold leading-none tracking-tight text-text-bright">
              With friends
            </h2>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-base font-bold text-text-muted">
                Your name in the room
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={me?.username || "Anonymous Raptor"}
                maxLength={24}
                className="w-full rounded-xl border border-border-strong bg-background px-3.5 py-2.5 text-lg text-text-bright placeholder:text-text-dim focus:border-text-bright focus:outline-none"
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void start("group")}
              className="mt-3 w-full cursor-pointer rounded-full bg-text-bright px-4 py-3 text-lg font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "One moment" : "Open the room"}
            </button>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void start("solo")}
            className="block w-full cursor-pointer rounded-2xl border border-border-strong p-4 text-left transition-colors hover:border-text-bright disabled:opacity-60 sm:p-5"
          >
            <span className="block font-display text-2xl font-extrabold leading-none tracking-tight text-text-bright">
              Just me
            </span>
            <span className="mt-1.5 block text-base text-text-muted">On this phone only.</span>
          </button>
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-border pt-5">
          <label htmlFor="night-code" className="text-lg font-bold text-text-bright">
            Room code
          </label>
          <input
            id="night-code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            placeholder="ABCDE"
            maxLength={5}
            className="w-[120px] rounded-full border border-border-strong bg-background px-4 py-2 font-mono text-lg uppercase tracking-[0.2em] text-text-bright placeholder:text-text-dim focus:border-text-bright focus:outline-none"
          />
          {/* Disabled until it could possibly be a code, which deletes the
              "that code looks too short" error instead of explaining it. */}
          <button
            type="button"
            disabled={code.length < 4 || busy}
            onClick={() => void navigate({ to: "/night/$code", params: { code } })}
            className="cursor-pointer rounded-full bg-text-bright px-4 py-2 text-lg font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            Join
          </button>
        </div>

        {error && <p className="mt-4 text-base text-status-disliked">{error}</p>}
      </main>
    </div>
  );
}
