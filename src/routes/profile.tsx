import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useMyProfile";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/balasaur/Avatar";
import { DinoMark } from "@/components/balasaur/DinoMark";
import { useUserStatus } from "@/hooks/useUserStatus";
import { MIN_BASIS_TITLES, tasteReadiness } from "@/lib/taste";
import { CometMark } from "@/components/arcade/CometChip";
import { useComets } from "@/lib/arcade/useComets";
import { GAMES, HUB_ORDER } from "@/lib/arcade/games";
import type { GameSlug } from "@/lib/arcade/types";
import { AVATAR_PRESETS } from "@/lib/avatar";
import { checkUsername, updateMyProfile, type ProfileDTO } from "@/lib/profile.functions";
import { normalizeUsername, validateUsername, USERNAME_MAX } from "@/lib/username";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Edit profile · Balasaur" },
      { name: "description", content: "Edit your public Balasaur profile." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ProfileEditor,
});

const GENRES = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "Horror",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Thriller",
];
const BIO_MAX = 280;

const inputCls =
  "h-10 w-full rounded-xl border border-border-strong bg-background px-3 text-lg text-foreground placeholder:text-text-dim focus:border-text-bright focus:outline-none disabled:opacity-50";
const btnPrimary =
  "cursor-pointer rounded-full bg-text-bright px-4 py-2 text-lg font-bold text-background hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed";

type UStatus = { kind: "idle" | "checking" | "ok" | "bad"; msg?: string };

function ProfileEditor() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile, isLoading } = useMyProfile();

  const checkFn = useServerFn(checkUsername);
  const updateFn = useServerFn(updateMyProfile);

  // Local form state, seeded once the profile loads.
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [avatarPreset, setAvatarPreset] = useState<string | null>(null);
  const [genres, setGenres] = useState<string[]>([]);
  const [seeded, setSeeded] = useState(false);

  const [uStatus, setUStatus] = useState<UStatus>({ kind: "idle" });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/", replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (profile && !seeded) {
      setDisplayName(profile.displayName);
      setUsername(profile.username);
      setBio(profile.bio);
      setIsPublic(profile.isPublic);
      setAvatarPreset(profile.avatarPreset);
      setGenres(profile.favoriteGenres);
      setSeeded(true);
    }
  }, [profile, seeded]);

  const usernameChanged =
    !!profile && normalizeUsername(username) !== profile.username.toLowerCase();

  // Live availability check (debounced) when the handle changes.
  useEffect(() => {
    if (!usernameChanged) {
      setUStatus({ kind: "idle" });
      return;
    }
    const norm = normalizeUsername(username);
    const v = validateUsername(norm);
    if (!v.ok) {
      setUStatus({ kind: "bad", msg: v.reason });
      return;
    }
    setUStatus({ kind: "checking" });
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await checkFn({ data: { username: norm } });
        if (cancelled) return;
        setUStatus(
          res.available
            ? { kind: "ok", msg: "Available" }
            : { kind: "bad", msg: res.reason ?? "Taken" },
        );
      } catch {
        if (!cancelled) setUStatus({ kind: "idle" });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [username, usernameChanged, checkFn]);

  const canSave = useMemo(() => {
    if (saving || !profile) return false;
    if (usernameChanged && uStatus.kind !== "ok") return false;
    return true;
  }, [saving, profile, usernameChanged, uStatus.kind]);

  function toggleGenre(g: string) {
    setGenres((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : prev.length >= 12 ? prev : [...prev, g],
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const updated = (await updateFn({
        data: {
          displayName,
          bio,
          isPublic,
          avatarPreset,
          favoriteGenres: genres,
          ...(usernameChanged ? { username: normalizeUsername(username) } : {}),
        },
      })) as ProfileDTO;
      // Refresh the cached profile everywhere (TopBar, public page).
      qc.setQueryData(["my-profile", user?.id ?? null], updated);
      void qc.invalidateQueries({ queryKey: ["my-profile"] });
      setUsername(updated.username);
      setUStatus({ kind: "idle" });
      setSaveMsg({ kind: "ok", text: "Saved." });
    } catch (err) {
      setSaveMsg({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user || isLoading || !profile) {
    return (
      <div className="bg-background text-foreground">
        <main id="main" className="mx-auto max-w-article px-4 pb-12 pt-6 md:pt-9">
          <p className="text-lg text-text-dim">Loading…</p>
        </main>
      </div>
    );
  }

  const uStatusColor =
    uStatus.kind === "ok"
      ? "text-rating"
      : uStatus.kind === "bad"
        ? "text-destructive"
        : "text-text-dim";

  return (
    <div className="bg-background text-foreground">
      <main id="main" className="mx-auto max-w-article px-4 pb-12 pt-6 md:pt-9">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-text-bright md:text-[64px]">
            Edit profile
          </h1>
          <a
            href={`/@${profile.username}`}
            className="rounded-full border border-border-strong px-3.5 py-1.5 text-base font-bold text-text-bright hover:border-text-bright"
          >
            Public profile
          </a>
        </header>

        <form onSubmit={save} className="space-y-7">
          {/* Avatar + identity preview */}
          <section className="flex items-center gap-4 rounded-2xl bg-panel p-5">
            <Avatar
              username={normalizeUsername(username) || profile.username}
              displayName={displayName}
              preset={avatarPreset}
              size={64}
              className="text-2xl"
            />
            <div className="min-w-0">
              <p className="truncate font-display text-3xl font-extrabold leading-none tracking-tight text-text-bright">
                {displayName || `@${normalizeUsername(username) || profile.username}`}
              </p>
              <p className="mt-1 font-mono text-base text-text-muted">
                @{normalizeUsername(username) || profile.username}
              </p>
            </div>
          </section>

          {/* Avatar preset */}
          <Field label="Avatar color">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setAvatarPreset(null)}
                title="Auto (from handle)"
                className={`h-8 rounded-full border px-3 text-base font-bold ${
                  avatarPreset === null
                    ? "border-text-bright bg-text-bright text-background"
                    : "border-border-strong text-text-bright hover:border-text-bright"
                }`}
              >
                Auto
              </button>
              {AVATAR_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setAvatarPreset(p.key)}
                  title={p.key}
                  style={{ background: p.bg }}
                  className={`h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-background ${
                    avatarPreset === p.key ? "ring-text-bright" : "ring-transparent"
                  }`}
                />
              ))}
            </div>
          </Field>

          {/* Display name */}
          <Field label="Display name">
            <input
              value={displayName}
              maxLength={60}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputCls}
              placeholder="Your name"
            />
          </Field>

          {/* Username */}
          <Field
            label="Username"
            hint="Letters, numbers, underscores. This is your @handle and your page URL."
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg text-text-muted">@</span>
              <input
                value={username}
                maxLength={USERNAME_MAX}
                onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
                className={inputCls}
                placeholder="handle"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            {usernameChanged && uStatus.msg && (
              <p className={`text-base ${uStatusColor}`}>
                {uStatus.kind === "checking" ? "Checking…" : uStatus.msg}
              </p>
            )}
          </Field>

          {/* Bio */}
          <Field label="Bio">
            <textarea
              value={bio}
              maxLength={BIO_MAX}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className={`${inputCls} h-auto py-2`}
              placeholder="A line or two about your taste…"
            />
            <p className="text-right font-mono text-sm tabular-nums text-text-muted">
              {bio.length}/{BIO_MAX}
            </p>
          </Field>

          {/* Favorite genres */}
          <Field label="Favorite genres" hint="Up to 12.">
            <div className="flex flex-wrap gap-1.5">
              {GENRES.map((g) => {
                const on = genres.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleGenre(g)}
                    className={`rounded-full border px-3 py-1 text-base font-bold ${
                      on
                        ? "border-text-bright bg-text-bright text-background"
                        : "border-border-strong text-text-bright hover:border-text-bright"
                    }`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Visibility */}
          <Field label="Visibility">
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="h-4 w-4 accent-text-bright"
              />
              <span className="text-lg font-bold text-text-bright">
                Public profile
                <span className="ml-2 font-normal text-text-muted">
                  {isPublic
                    ? "Anyone can open your profile page, and search engines can index it."
                    : "Hidden. Only you can see it."}
                </span>
              </span>
            </label>
          </Field>

          <div className="flex items-center gap-3 border-t border-border pt-5">
            <button type="submit" disabled={!canSave} className={btnPrimary}>
              {saving ? "Saving…" : "Save profile"}
            </button>
            <Link
              to="/account"
              className="rounded-full border border-border-strong px-4 py-2 text-lg font-bold text-text-bright hover:border-text-bright"
            >
              Account settings
            </Link>
            {saveMsg && (
              <span
                className={`text-base ${
                  saveMsg.kind === "ok" ? "text-rating" : "text-destructive"
                }`}
              >
                {saveMsg.text}
              </span>
            )}
          </div>
        </form>

        <TasteCardTeaser />

        <ArcadeStatsSection userId={user.id} />
      </main>
    </div>
  );
}

/** The way to the shareable card, with the one number that decides whether it
 *  can be drawn. Costs no request: the counts are already in the status store. */
function TasteCardTeaser() {
  const { statuses, ready } = useUserStatus();
  if (!ready) return null;
  const r = tasteReadiness(statuses);
  const rated = Math.max(r.liked, r.watched);

  return (
    <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-panel p-5">
      <div className="flex items-center gap-3.5">
        <DinoMark
          size={40}
          mood={r.ready ? "chomp" : "sleep"}
          className="h-10 w-10 shrink-0 text-text-bright"
        />
        <div>
          <h2 className="font-display text-2xl font-extrabold leading-none tracking-tight text-text-bright">
            Taste Card
          </h2>
          <p className="mt-1 text-base text-text-muted">
            {r.ready
              ? `${rated} titles rated. Your card is ready.`
              : `${rated} of ${MIN_BASIS_TITLES} titles rated.`}
          </p>
        </div>
      </div>
      {r.ready ? (
        <Link
          to="/taste"
          className="inline-flex cursor-pointer items-center rounded-full bg-text-bright px-4 py-2 text-base font-bold text-background hover:opacity-90"
        >
          Open your card
        </Link>
      ) : (
        <Link
          to="/watched"
          className="inline-flex cursor-pointer items-center rounded-full border border-border-strong bg-background px-4 py-2 text-base font-bold text-text-bright hover:border-text-bright"
        >
          Rate titles
        </Link>
      )}
    </section>
  );
}

interface ArcadeStatRow {
  game_slug: string;
  plays: number;
  best_score: number;
  best_streak: number;
}

/** The signed-in player's own arcade record: comet total plus per-game
 *  bests from their arcade_stats rows (select-own RLS). Renders nothing
 *  until the balance is ready, and nothing at all for someone who never
 *  played. The generated types predate arcade_stats, so the read goes
 *  through one narrow cast here. */
function ArcadeStatsSection({ userId }: { userId: string }) {
  const { total, ready } = useComets();
  const [rows, setRows] = useState<ArcadeStatRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    type StatsQuery = {
      select(c: string): {
        eq(
          col: string,
          val: string,
        ): PromiseLike<{ data: ArcadeStatRow[] | null; error: { message: string } | null }>;
      };
    };
    (supabase as unknown as { from(t: string): StatsQuery })
      .from("arcade_stats")
      .select("game_slug, plays, best_score, best_streak")
      .eq("user_id", userId)
      .then(({ data, error }) => {
        if (cancelled) return;
        // Supabase returns errors rather than throwing; a failed read just
        // means the section shows the comet total alone.
        if (error) {
          console.error("[profile] arcade stats read failed:", error.message);
          setRows([]);
          return;
        }
        setRows((data ?? []).filter((r) => r.plays > 0));
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!ready || rows === null) return null;
  if (total === 0 && rows.length === 0) return null;

  const ordered = HUB_ORDER.map((slug) => rows.find((r) => r.game_slug === slug)).filter(
    (r): r is ArcadeStatRow => !!r,
  );

  return (
    <section className="mt-4 rounded-2xl bg-panel p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl font-extrabold leading-none tracking-tight text-text-bright">
          Arcade
        </h2>
        <span className="inline-flex items-center gap-1.5 font-mono text-base tabular-nums text-text-bright">
          <CometMark className="h-4 w-4" />
          <span className="tabular-nums">{total}</span> comets
        </span>
      </div>
      {ordered.length > 0 && (
        <ul className="mt-3 space-y-1">
          {ordered.map((r) => (
            <li key={r.game_slug} className="flex items-baseline justify-between gap-3 text-base">
              <span className="text-text-muted">
                {GAMES[r.game_slug as GameSlug]?.name ?? r.game_slug}
              </span>
              <span className="font-mono tabular-nums text-text">
                best {r.best_score} · {r.plays} play{r.plays === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-lg font-bold text-text-bright">{label}</label>
      {children}
      {hint && <p className="text-base text-text-muted">{hint}</p>}
    </div>
  );
}
