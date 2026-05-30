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

export function AuthDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
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
          <DialogDescription className="font-mono text-[10.5px] uppercase tracking-wider text-text-dim">
            Save your library across devices
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={google}
          className="w-full cursor-pointer rounded-[5px] border border-border bg-background px-3 py-2 font-mono text-[12px] uppercase tracking-wider text-text-bright hover:border-border-strong"
        >
          Continue with Google
        </button>

        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-text-dim">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={submit} className="space-y-2">
          <input
            type="email"
            required
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9 w-full rounded-[5px] border border-border bg-background px-2.5 font-mono text-[12px] text-foreground placeholder:text-text-dim focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-9 w-full rounded-[5px] border border-border bg-background px-2.5 font-mono text-[12px] text-foreground placeholder:text-text-dim focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          {error && <p className="font-mono text-[10.5px] text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full cursor-pointer rounded-[5px] bg-primary px-3 py-2 font-mono text-[12px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="cursor-pointer font-mono text-[10.5px] uppercase tracking-wider text-text-muted hover:text-text-bright"
        >
          {mode === "signin" ? "No account? Create one" : "Have an account? Sign in"}
        </button>
      </DialogContent>
    </Dialog>
  );
}
