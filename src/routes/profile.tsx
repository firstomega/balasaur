import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useMyProfile";
import { TopBar } from "@/components/balasaur/TopBar";
import { Avatar } from "@/components/balasaur/Avatar";
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
  "h-9 w-full rounded-[5px] border border-border bg-background px-2.5 font-mono text-[12px] text-foreground placeholder:text-text-dim focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50";
const btnPrimary =
  "cursor-pointer rounded-[5px] bg-primary px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed";

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
      <div className="min-h-screen bg-background text-foreground">
        <TopBar />
        <main className="mx-auto max-w-[760px] px-5 py-12">
          <p className="font-mono text-[12px] uppercase tracking-wider text-text-dim">Loading…</p>
        </main>
      </div>
    );
  }

  const uStatusColor =
    uStatus.kind === "ok"
      ? "text-emerald-400"
      : uStatus.kind === "bad"
        ? "text-red-400"
        : "text-text-dim";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="mx-auto max-w-[760px] px-5 py-10">
        <header className="mb-7 border-b border-border pb-5">
          <h1 className="font-sans text-3xl font-semibold tracking-tight text-text-bright">
            Edit profile
          </h1>
          <p className="mt-2 font-mono text-[11px] text-text-dim">
            This is your <span className="text-text-bright">public</span> page — it's what other
            people see.{" "}
            <a href={`/@${profile.username}`} className="text-primary hover:underline">
              View your public profile →
            </a>
          </p>
        </header>

        <form onSubmit={save} className="space-y-7">
          {/* Avatar + identity preview */}
          <section className="flex items-center gap-4 rounded-[6px] border border-border bg-panel/40 p-5">
            <Avatar
              username={normalizeUsername(username) || profile.username}
              displayName={displayName}
              preset={avatarPreset}
              size={64}
              className="text-[26px]"
            />
            <div className="min-w-0">
              <p className="truncate font-sans text-lg font-semibold text-text-bright">
                {displayName || `@${normalizeUsername(username) || profile.username}`}
              </p>
              <p className="font-mono text-[12px] text-primary">
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
                className={`h-8 rounded-full border px-3 font-mono text-[10px] uppercase tracking-wider ${
                  avatarPreset === null
                    ? "border-primary text-primary"
                    : "border-border text-text-dim hover:border-border-strong"
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
              <span className="font-mono text-[13px] text-text-dim">@</span>
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
              <p className={`font-mono text-[10.5px] ${uStatusColor}`}>
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
            <p className="text-right font-mono text-[10px] text-text-dim">
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
                    className={`rounded-full border px-2.5 py-1 font-mono text-[11px] ${
                      on
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-text-muted hover:border-border-strong"
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
                className="h-4 w-4 accent-primary"
              />
              <span className="font-mono text-[12px] text-text-bright">
                Public profile
                <span className="ml-2 font-normal text-text-dim">
                  {isPublic
                    ? "Anyone with the link can see your profile."
                    : "Hidden — only you can see it."}
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
              className="font-mono text-[11px] uppercase tracking-wider text-text-muted hover:text-text-bright"
            >
              Account settings →
            </Link>
            {saveMsg && (
              <span
                className={`font-mono text-[10.5px] ${
                  saveMsg.kind === "ok" ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {saveMsg.text}
              </span>
            )}
          </div>
        </form>
      </main>
    </div>
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
      <label className="block font-mono text-[10.5px] uppercase tracking-wider text-text-dim">
        {label}
      </label>
      {children}
      {hint && <p className="font-mono text-[10.5px] text-text-dim">{hint}</p>}
    </div>
  );
}
