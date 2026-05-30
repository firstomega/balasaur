import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { TopBar } from "@/components/balasaur/TopBar";
import { openCookieSettings } from "@/lib/consent";
import {
  exportMyData,
  clearMyActivity,
  deleteMyAccount,
} from "@/lib/account.functions";
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
  "US", "CA", "GB", "IE", "AU", "NZ", "DE", "FR", "ES", "IT", "NL", "SE",
  "NO", "DK", "FI", "PT", "BE", "AT", "CH", "PL", "BR", "MX", "AR", "JP",
  "KR", "IN", "SG", "ZA",
];

function AccountPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/", replace: true });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <TopBar />
        <main className="mx-auto max-w-[860px] px-5 py-12">
          <p className="font-mono text-[12px] uppercase tracking-wider text-text-dim">
            Loading…
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="mx-auto max-w-[860px] px-5 py-10">
        <header className="mb-8 border-b border-border pb-5">
          <h1 className="font-sans text-3xl font-semibold tracking-tight text-text-bright">
            Account
          </h1>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-text-dim">
            Signed in as {user.email}
          </p>
        </header>

        <div className="space-y-6">
          <SecuritySection email={user.email ?? ""} />
          <PreferencesSection
            initial={(user.user_metadata?.region as string | undefined) ?? ""}
          />
          <NotificationsSection />
          <PrivacySection />
          <SubscriptionSection />
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
  const border = tone === "danger" ? "border-red-500/60" : "border-border";
  return (
    <section
      className={`rounded-[6px] border ${border} bg-panel/40 p-5`}
    >
      <h2
        className={`mb-4 font-mono text-[12px] font-semibold uppercase tracking-wider ${
          tone === "danger" ? "text-red-400" : "text-text-bright"
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
      <label className="block font-mono text-[10.5px] uppercase tracking-wider text-text-dim">
        {label}
      </label>
      {children}
      {hint && (
        <p className="font-mono text-[10.5px] text-text-dim">{hint}</p>
      )}
    </div>
  );
}

const inputCls =
  "h-9 w-full rounded-[5px] border border-border bg-background px-2.5 font-mono text-[12px] text-foreground placeholder:text-text-dim focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50";

const btnPrimary =
  "cursor-pointer rounded-[5px] bg-primary px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed";

const btnSecondary =
  "cursor-pointer rounded-[5px] border border-border bg-background px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-text-bright hover:border-border-strong disabled:opacity-50 disabled:cursor-not-allowed";

const btnDanger =
  "cursor-pointer rounded-[5px] border border-red-500/60 bg-red-500/10 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-red-300 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed";

function Status({ msg }: { msg: { kind: "ok" | "err"; text: string } | null }) {
  if (!msg) return null;
  return (
    <p
      className={`font-mono text-[10.5px] ${
        msg.kind === "ok" ? "text-emerald-400" : "text-red-400"
      }`}
    >
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
        <Field
          label="Region / country"
          hint="Used later to refine streaming availability."
        >
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className={inputCls}
          >
            <option value="">— Not set —</option>
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

/* ---------- 3. Notifications & Email ---------- */

function NotificationsSection() {
  const rows = [
    { label: "Product updates", desc: "Important changes to Balasaur." },
    { label: "Weekly digest", desc: "A roundup of what's new." },
    { label: "Marketing", desc: "Occasional news and offers." },
  ];
  return (
    <Section title="Notifications & Email">
      <p className="font-mono text-[10.5px] uppercase tracking-wider text-text-dim">
        Coming soon — no email system is wired up yet.
      </p>
      <ul className="divide-y divide-border rounded-[5px] border border-border">
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex items-center justify-between gap-4 px-3 py-2.5 opacity-60"
          >
            <div>
              <p className="font-mono text-[12px] text-text-bright">{r.label}</p>
              <p className="font-mono text-[10.5px] text-text-dim">{r.desc}</p>
            </div>
            <label className="inline-flex cursor-not-allowed items-center">
              <input type="checkbox" disabled className="h-4 w-4 accent-primary" />
            </label>
          </li>
        ))}
      </ul>
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
      <div className="flex gap-4 font-mono text-[11px] uppercase tracking-wider">
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

/* ---------- 5. Subscription ---------- */

function SubscriptionSection() {
  return (
    <Section title="Subscription">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1 rounded-[5px] border border-border bg-background p-3">
          <p className="font-mono text-[10.5px] uppercase tracking-wider text-text-dim">
            Current plan
          </p>
          <p className="mt-1 font-sans text-lg text-text-bright">Free</p>
        </div>
        <div className="flex-1 rounded-[5px] border border-dashed border-border bg-background p-3 opacity-70">
          <p className="font-mono text-[10.5px] uppercase tracking-wider text-text-dim">
            Balasaur Pro
          </p>
          <p className="mt-1 font-sans text-lg text-text-bright">Coming soon</p>
        </div>
      </div>
    </Section>
  );
}

/* ---------- 6. Danger Zone ---------- */

function DangerZone({
  email,
  onDeleted,
}: {
  email: string;
  onDeleted: () => Promise<void>;
}) {
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
            <p className="font-mono text-[12px] text-text-bright">Clear my activity</p>
            <p className="font-mono text-[10.5px] text-text-dim">
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
            <p className="font-mono text-[12px] text-text-bright">
              Delete my account permanently
            </p>
            <p className="font-mono text-[10.5px] text-text-dim">
              This cannot be undone.
            </p>
          </div>
          <button onClick={() => setDelOpen(true)} className={btnDanger}>
            Delete account
          </button>
        </div>
        <Status msg={msg} />
      </div>

      {/* Clear confirm */}
      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent className="border-border bg-panel text-foreground sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="font-mono text-[13px] uppercase tracking-wider text-text-bright">
              Clear all activity?
            </DialogTitle>
            <DialogDescription className="font-mono text-[11px] text-text-dim">
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
        <DialogContent className="border-red-500/60 bg-panel text-foreground sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="font-mono text-[13px] uppercase tracking-wider text-red-300">
              Delete account permanently
            </DialogTitle>
            <DialogDescription className="font-mono text-[11px] text-text-dim">
              This will remove:
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 font-mono text-[11px] text-text-muted marker:text-text-dim">
            <li>Your account ({email})</li>
            <li>Your watch / triage history</li>
            <li>Any lists tied to your account</li>
          </ul>
          <Field
            label={`Type DELETE or your email to confirm`}
          >
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
            <button
              onClick={doDelete}
              disabled={!canDelete || busy}
              className={btnDanger}
            >
              {busy ? "…" : "Delete forever"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}