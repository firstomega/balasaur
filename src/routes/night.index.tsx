import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { buildMeta, canonicalLink, absoluteUrl, noindexMeta } from "@/lib/seo";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useMyProfile";
import { createNightRoom, setNightToken, getSavedNightName, setSavedNightName } from "@/lib/night";
import { capturePostHogEvent } from "@/lib/posthog";
import { Footer } from "@/components/balasaur/Footer";

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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar />
      {/* The room, not a form on a void. Movie Night and My Library are the
          site's two personal spaces, so they share one warm treatment: a lit
          pool on a dim wall. The catalog stays a terminal; these two rooms do
          not. Drawn in CSS, so the page still ships no images of its own. */}
      <div className="relative flex-1 overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(130% 60% at 50% -10%, rgba(214,166,96,.13), transparent 62%), radial-gradient(90% 45% at 50% 4%, rgba(190,142,80,.09), transparent 70%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 80% at 50% 26%, transparent 52%, rgba(0,0,0,.5) 100%)",
          }}
        />
        <main className="relative mx-auto w-full max-w-[560px] px-4 pb-16 pt-10 sm:pt-14">
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-text-bright sm:text-[36px]">
            Movie Night
          </h1>
          <p className="mt-1.5 text-[15px] leading-relaxed text-text-muted">
            One title, agreed on, in about a minute.
          </p>

          {/* Two real choices with real weight, and the code as a line rather
              than a third identical box. The old page made you pick a path and
              THEN revealed a form, which was two taps to reach one field. */}
          <div className="mt-8 space-y-3">
            <div className="rounded-[8px] border border-primary/40 bg-primary/[0.07] p-4 sm:p-5">
              <h2 className="text-[18px] font-semibold text-text-bright">With friends</h2>
              <label className="mt-3 block">
                <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-text-muted">
                  Your name in the room
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={me?.username || "Anonymous Raptor"}
                  maxLength={24}
                  className="w-full rounded-[5px] border border-border bg-background px-3 py-2.5 text-[15px] text-text-bright placeholder:text-text-dim focus:border-primary focus:outline-none"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void start("group")}
                className="mt-3 w-full cursor-pointer rounded-[5px] bg-primary px-4 py-2.5 text-[14px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {busy ? "One moment" : "Open the room"}
              </button>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => void start("solo")}
              className="block w-full cursor-pointer rounded-[8px] border border-border bg-panel p-4 text-left transition-colors hover:border-border-strong disabled:opacity-60 sm:p-5"
            >
              <span className="block text-[18px] font-semibold text-text-bright">Just me</span>
              <span className="mt-0.5 block text-[13.5px] text-text-muted">No room, no code.</span>
            </button>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-border pt-5">
            <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
              Have a code?
            </span>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              placeholder="ABCDE"
              maxLength={5}
              aria-label="Room code"
              className="w-[110px] rounded-[5px] border border-border bg-background px-3 py-2 font-mono text-[15px] uppercase tracking-[0.2em] text-text-bright placeholder:text-text-dim focus:border-primary focus:outline-none"
            />
            {/* Disabled until it could possibly be a code, which deletes the
                "that code looks too short" error instead of explaining it. */}
            <button
              type="button"
              disabled={code.length < 4 || busy}
              onClick={() => void navigate({ to: "/night/$code", params: { code } })}
              className="cursor-pointer rounded-[5px] border border-border-strong bg-panel px-4 py-2 font-mono text-[12px] uppercase tracking-wider text-text-bright transition-colors hover:border-primary disabled:opacity-40"
            >
              Join
            </button>
          </div>

          {error && <p className="mt-4 text-[13.5px] text-[#e08aa4]">{error}</p>}
        </main>
      </div>
      <Footer />
    </div>
  );
}
