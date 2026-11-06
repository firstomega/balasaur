import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { openCookieSettings } from "@/lib/consent";
import { exportMyData, clearMyActivity, deleteMyAccount } from "@/lib/account.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Account · Balasaur" },
      { name: "description", content: "Manage your Balasaur account, security, and data." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AccountPage,
});

const COUNTRIES = [
  "US",
  "CA",
  "GB",
  "IE",
  "AU",
  "NZ",
  "DE",
  "FR",
  "ES",
  "IT",
  "NL",
  "SE",
  "NO",
  "DK",
  "FI",
  "PT",
  "BE",
  "AT",
  "CH",
  "PL",
  "BR",
  "MX",
  "AR",
  "JP",
  "KR",
  "IN",
  "SG",
  "ZA",
];

function AccountPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/", replace: true });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="bg-background text-foreground">
        <main id="main" className="mx-auto max-w-article px-4 pb-12 pt-6 md:pt-9">
          <p className="text-lg text-text-dim">Loading…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="bg-background text-foreground">
      <main id="main" className="mx-auto max-w-article px-4 pb-12 pt-6 md:pt-9">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-text-bright md:text-[64px]">
              Account
            </h1>
            <p className="mt-2 text-lg text-text-muted">
              Signed in as{" "}
              <span className="ph-no-capture font-mono text-base text-text-bright">
                {user.email}
              </span>
            </p>
          </div>
          <Link
            to="/profile"
            className="rounded-full border border-border-strong px-3.5 py-1.5 text-base font-bold text-text-bright hover:border-text-bright"
          >
            Public profile
          </Link>
        </header>

        <div className="space-y-4">
          <SecuritySection email={user.email ?? ""} />
          <PreferencesSection initial={(user.user_metadata?.region as string | undefined) ?? ""} />
          <ArcadeSection userId={user.id} />
          <PrivacySection />
          <DangerZone email={user.email ?? ""} onDeleted={signOut} />
        </div>
      </main>
    </div>
  );
}

/* ---------- shared chrome ---------- */

function Section({
  title,
  children,
  tone = "default",
}: {
  title: string;
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <section
      className={`rounded-2xl p-5 ${tone === "danger" ? "border-2 border-destructive" : "bg-panel"}`}
    >
      <h2
        className={`mb-4 font-display text-2xl font-extrabold leading-none tracking-tight ${
          tone === "danger" ? "text-destructive" : "text-text-bright"
        }`}
      >
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-lg font-bold text-text-bright">{label}</label>
      {children}
      {hint && <p className="text-base text-text-muted">{hint}</p>}
    </div>
  );
}

const inputCls =
  "h-10 w-full rounded-xl border border-border-strong bg-background px-3 text-lg text-foreground placeholder:text-text-dim focus:border-text-bright focus:outline-none disabled:opacity-50";

const btnPrimary =
  "cursor-pointer rounded-full bg-text-bright px-4 py-2 text-lg font-bold text-background hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed";

const btnSecondary =
  "cursor-pointer rounded-full border border-border-strong bg-background px-4 py-2 text-lg font-bold text-text-bright hover:border-text-bright disabled:opacity-40 disabled:cursor-not-allowed";

const btnDanger =
  "cursor-pointer rounded-full border-2 border-destructive bg-background px-4 py-2 text-lg font-bold text-destructive hover:bg-destructive hover:text-background disabled:opacity-40 disabled:cursor-not-allowed";

function Status({ msg }: { msg: { kind: "ok" | "err"; text: string } | null }) {
  if (!msg) return null;
  return (
    <p className={`text-base ${msg.kind === "ok" ? "text-rating" : "text-destructive"}`}>
      {msg.text}
    </p>
  );
}

/* ---------- 1. Login & Security ---------- */

function SecuritySection({ email }: { email: string }) {
  const [newEmail, setNewEmail] = useState(email);
  const [pw, setPw] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pwMsg, setPwMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailBusy(true);
    setEmailMsg(null);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setEmailBusy(false);
    if (error) setEmailMsg({ kind: "err", text: error.message });
    else setEmailMsg({ kind: "ok", text: "Check your inbox to confirm the new email." });
  }

  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    setPwBusy(true);
    setPwMsg(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwBusy(false);
    if (error) setPwMsg({ kind: "err", text: error.message });
    else {
      setPw("");
      setPwMsg({ kind: "ok", text: "Password updated." });
    }
  }

  return (
    <Section title="Login & Security">
      <form onSubmit={changeEmail} className="space-y-2">
        <Field label="Email" hint="We'll send a confirmation link to the new address.">
          <input
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className={inputCls}
          />
        </Field>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={emailBusy || newEmail === email} className={btnPrimary}>
            {emailBusy ? "…" : "Change email"}
          </button>
          <Status msg={emailMsg} />
        </div>
      </form>

      <div className="h-px bg-border" />

      <form onSubmit={changePw} className="space-y-2">
        <Field label="New password">
          <input
            type="password"
            required
            minLength={6}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className={inputCls}
            placeholder="At least 6 characters"
          />
        </Field>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pwBusy || pw.length < 6} className={btnPrimary}>
            {pwBusy ? "…" : "Change password"}
          </button>
          <Status msg={pwMsg} />
        </div>
      </form>
    </Section>
  );
}

/* ---------- 2. Preferences ---------- */

function PreferencesSection({ initial }: { initial: string }) {
  const [region, setRegion] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.updateUser({ data: { region } });
    setBusy(false);
    if (error) setMsg({ kind: "err", text: error.message });
    else setMsg({ kind: "ok", text: "Saved." });
  }

  return (
    <Section title="Preferences">
      <form onSubmit={save} className="space-y-2">
        <Field label="Region / country" hint="Used later to refine streaming availability.">
          <select value={region} onChange={(e) => setRegion(e.target.value)} className={inputCls}>
            <option value="">Not set</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? "…" : "Save"}
          </button>
          <Status msg={msg} />
        </div>
      </form>
    </Section>
  );
}

/* ---------- 2b. Arcade ---------- */

/** Optional leaderboard country on the profiles row (nullable, clearable).
 *  The generated types predate the country column, so the reads and the
 *  update go through one narrow cast here. */
function ArcadeSection({ userId }: { userId: string }) {
  const [country, setCountry] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    type CountryRead = PromiseLike<{
      data: { country: string | null } | null;
      error: { message: string } | null;
    }>;
    type CountryQuery = {
      select(c: string): { eq(col: string, val: string): { maybeSingle(): CountryRead } };
    };
    (supabase as unknown as { from(t: string): CountryQuery })
      .from("profiles")
      .select("country")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        // Supabase returns errors rather than throwing; a failed read just
        // starts the selector at "Not set".
        if (error) console.error("[account] country read failed:", error.message);
        setCountry(data?.country ?? "");
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    type CountryWrite = {
      update(values: Record<string, unknown>): {
        eq(col: string, val: string): PromiseLike<{ error: { message: string } | null }>;
      };
    };
    const { error } = await (supabase as unknown as { from(t: string): CountryWrite })
      .from("profiles")
      .update({ country: country || null, updated_at: new Date().toISOString() })
      .eq("id", userId);
    setBusy(false);
    if (error) setMsg({ kind: "err", text: error.message });
    else setMsg({ kind: "ok", text: "Saved." });
  }

  return (
    <Section title="Arcade">
      <form onSubmit={save} className="space-y-2">
        <Field label="Leaderboard country" hint="Sets which national leaderboard counts you.">
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            disabled={!loaded}
            className={inputCls}
          >
            <option value="">Not set</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy || !loaded} className={btnPrimary}>
            {busy ? "…" : "Save"}
          </button>
          <Status msg={msg} />
        </div>
      </form>
    </Section>
  );
}

/* ---------- 4. Privacy & Data ---------- */

function PrivacySection() {
  const exportFn = useServerFn(exportMyData);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function download() {
    setBusy(true);
    setMsg(null);
    try {
      const data = await exportFn();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `balasaur-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg({ kind: "ok", text: "Download started." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Privacy & Data">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={download} disabled={busy} className={btnPrimary}>
          {busy ? "…" : "Download my data"}
        </button>
        <button onClick={openCookieSettings} className={btnSecondary}>
          Cookie settings
        </button>
        <Status msg={msg} />
      </div>
      <div className="flex gap-4 text-base font-bold">
        <Link to="/privacy" className="text-text-muted hover:text-text-bright">
          Privacy policy
        </Link>
        <Link to="/terms" className="text-text-muted hover:text-text-bright">
          Terms
        </Link>
      </div>
    </Section>
  );
}

/* ---------- 6. Danger Zone ---------- */

function DangerZone({ email, onDeleted }: { email: string; onDeleted: () => Promise<void> }) {
  const clearFn = useServerFn(clearMyActivity);
  const deleteFn = useServerFn(deleteMyAccount);
  const navigate = useNavigate();

  const [clearOpen, setClearOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const canDelete =
    confirmText.trim() === "DELETE" || confirmText.trim().toLowerCase() === email.toLowerCase();

  async function doClear() {
    setBusy(true);
    setMsg(null);
    try {
      await clearFn();
      setClearOpen(false);
      setMsg({ kind: "ok", text: "Your activity was cleared." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    setBusy(true);
    setMsg(null);
    try {
      await deleteFn();
      await onDeleted();
      // Best-effort toast via alert; app has no toast system wired here.
      if (typeof window !== "undefined") {
        window.alert("Your account was deleted.");
      }
      navigate({ to: "/", replace: true });
    } catch (e) {
      setBusy(false);
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <Section title="Danger Zone" tone="danger">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-bold text-text-bright">Clear my activity</p>
            <p className="text-base leading-relaxed text-text-muted">
              Removes everything you've marked (seen, want, liked, disliked). Keeps your account.
            </p>
          </div>
          <button onClick={() => setClearOpen(true)} className={btnDanger}>
            Clear activity
          </button>
        </div>
        <div className="h-px bg-border" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-bold text-text-bright">Delete my account permanently</p>
            <p className="text-base text-text-muted">This cannot be undone.</p>
          </div>
          <button onClick={() => setDelOpen(true)} className={btnDanger}>
            Delete account
          </button>
        </div>
        <Status msg={msg} />
      </div>

      {/* Clear confirm */}
      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent className="rounded-2xl border-2 border-text-bright bg-background text-foreground sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-extrabold leading-none tracking-tight text-text-bright">
              Clear all activity?
            </DialogTitle>
            <DialogDescription className="text-base leading-relaxed text-text-muted">
              This permanently removes every title you've marked. Your account stays.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button onClick={() => setClearOpen(false)} className={btnSecondary}>
              Cancel
            </button>
            <button onClick={doClear} disabled={busy} className={btnDanger}>
              {busy ? "…" : "Yes, clear it"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog
        open={delOpen}
        onOpenChange={(v) => {
          setDelOpen(v);
          if (!v) setConfirmText("");
        }}
      >
        <DialogContent className="rounded-2xl border-2 border-destructive bg-background text-foreground sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-extrabold leading-none tracking-tight text-destructive">
              Delete account permanently
            </DialogTitle>
            <DialogDescription className="text-base leading-relaxed text-text-muted">
              This will remove:
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-base text-text-muted marker:text-text-dim">
            <li>
              Your account (<span className="ph-no-capture">{email}</span>)
            </li>
            <li>Your library (favorites, watchlist & watch history)</li>
            <li>Any lists tied to your account</li>
          </ul>
          <Field label={`Type DELETE or your email to confirm`}>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className={inputCls}
              placeholder="DELETE"
              autoComplete="off"
            />
          </Field>
          <DialogFooter className="gap-2">
            <button onClick={() => setDelOpen(false)} className={btnSecondary}>
              Cancel
            </button>
            <button onClick={doDelete} disabled={!canDelete || busy} className={btnDanger}>
              {busy ? "…" : "Delete forever"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}
