import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// On Lovable's managed project, Google sign-in rides Lovable's OAuth app. On the
// owner-managed Supabase project (VITE_APP_SUPABASE_URL set) it uses Supabase's own
// Google provider instead — which must be configured in the Supabase dashboard
// (Auth → Providers → Google) before the button is shown: flip VITE_APP_AUTH_GOOGLE=1
// once that's done. Email/password + magic links work everywhere regardless.
const OWN_SUPABASE = !!import.meta.env.VITE_APP_SUPABASE_URL;
const GOOGLE_AUTH_AVAILABLE = !OWN_SUPABASE || import.meta.env.VITE_APP_AUTH_GOOGLE === "1";

export function AuthDialog({
  open,
  onOpenChange,
  reason,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reason?: string;
}) {
  const [mode, setMode] = useState<"signin" | "signup" | "magic">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "magic") {
        // Passwordless: emails a one-tap sign-in link. Also the recovery path for
        // accounts that have no password (e.g. Google-created accounts after the
        // move off Lovable's OAuth).
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setNotice("Check your email for a sign-in link.");
        return;
      }
      const fn =
        mode === "signin"
          ? supabase.auth.signInWithPassword({ email, password })
          : supabase.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: window.location.origin },
            });
      const { error } = await fn;
      if (error) throw error;
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError(null);
    if (OWN_SUPABASE) {
      // Standard Supabase OAuth: full-page redirect to Google and back.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) setError(error.message);
      return;
    }
    const res = (await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    })) as { error?: unknown; redirected?: boolean };
    if (res.error) {
      setError(res.error instanceof Error ? res.error.message : String(res.error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-panel text-foreground sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="font-mono text-[13px] uppercase tracking-wider text-text-bright">
            {mode === "signin" ? "Sign in" : "Create account"}
          </DialogTitle>
          <DialogDescription className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
            {reason ?? "Save your library across devices"}
          </DialogDescription>
        </DialogHeader>

        {GOOGLE_AUTH_AVAILABLE && (
          <>
            <button
              type="button"
              onClick={google}
              className="w-full cursor-pointer rounded-[5px] border border-border bg-background px-3 py-2 font-mono text-[12px] uppercase tracking-wider text-text-bright hover:border-border-strong"
            >
              Continue with Google
            </button>

            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-text-dim">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}

        <form onSubmit={submit} className="space-y-2">
          <input
            type="email"
            required
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9 w-full rounded-[5px] border border-border bg-background px-2.5 font-mono text-[12px] text-foreground placeholder:text-text-dim focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          {mode !== "magic" && (
            <input
              type="password"
              required
              minLength={6}
              placeholder="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-9 w-full rounded-[5px] border border-border bg-background px-2.5 font-mono text-[12px] text-foreground placeholder:text-text-dim focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          )}
          {error && <p className="font-mono text-[12px] text-red-400">{error}</p>}
          {notice && <p className="font-mono text-[12px] text-primary">{notice}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full cursor-pointer rounded-[5px] bg-primary px-3 py-2 font-mono text-[12px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {busy
              ? "…"
              : mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : "Email me a sign-in link"}
          </button>
        </form>

        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="cursor-pointer text-left font-mono text-[11px] uppercase tracking-wider text-text-muted hover:text-text-bright"
          >
            {mode === "signin" ? "No account? Create one" : "Have an account? Sign in"}
          </button>
          {mode !== "magic" && (
            <button
              type="button"
              onClick={() => setMode("magic")}
              className="cursor-pointer text-left font-mono text-[11px] uppercase tracking-wider text-text-muted hover:text-text-bright"
            >
              Or email me a sign-in link (no password)
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
