// The comet balance, guest-first. Anonymous players keep one localStorage
// blob; signed-in players read their arcade_wallets row (select-own RLS) and
// the server owns the number. On sign-in, guest comets merge into the wallet
// once, mirroring useUserStatus: merge first, clear local ONLY on confirmed
// success, retry on a later mount if the merge never succeeded.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { arcadeMergeGuest, type GuestRunClaim } from "@/lib/arcade";
import type { GameSlug } from "./types";

const KEY = "balasaur:comets";

interface CometsBlob {
  total: number;
  /** Credited comets per day per game. One entry per (day, game) bounds
   *  double-crediting client-side, matching the server's one-run-per-day PK. */
  byDay: Record<string, Record<string, number>>;
}

function freshBlob(): CometsBlob {
  return { total: 0, byDay: {} };
}

function read(): CometsBlob {
  if (typeof window === "undefined") return freshBlob();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return freshBlob();
    const parsed = JSON.parse(raw) as Partial<CometsBlob> | null;
    if (!parsed || typeof parsed !== "object") return freshBlob();
    return {
      total: Number.isFinite(parsed.total) ? (parsed.total as number) : 0,
      byDay: parsed.byDay && typeof parsed.byDay === "object" ? parsed.byDay : {},
    };
  } catch {
    return freshBlob();
  }
}

function write(blob: CometsBlob): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(blob));
  } catch {
    // storage full or blocked; the balance just will not survive a refresh
  }
}

function clearLocal(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

function toClaims(blob: CometsBlob): GuestRunClaim[] {
  const claims: GuestRunClaim[] = [];
  for (const [dayKey, games] of Object.entries(blob.byDay)) {
    const day = Number(dayKey);
    if (!Number.isFinite(day)) continue;
    for (const [slug, comets] of Object.entries(games)) {
      if (!Number.isFinite(comets) || comets <= 0) continue;
      claims.push({ g: slug, d: day, c: comets });
    }
  }
  return claims;
}

// The generated Database types predate arcade_wallets, so the own-row select
// goes through one narrow cast here and nowhere else.
async function fetchWalletTotal(userId: string): Promise<number | null> {
  // The generated Database types predate arcade_wallets, so the own-row
  // select goes through one loose cast here and nowhere else; the result is
  // typed on read. Supabase returns errors rather than throwing.
  const { data, error } = (await (supabase as unknown as { from(t: string): any })
    .from("arcade_wallets")
    .select("comets")
    .eq("user_id", userId)
    .maybeSingle()) as {
    data: { comets: number } | null;
    error: { message: string } | null;
  };
  if (error) {
    console.error("[comets] wallet read failed:", error.message);
    return null;
  }
  return data?.comets ?? 0;
}

export function useComets(): {
  total: number;
  ready: boolean;
  /** Credit a finished run. Guests: written to the blob, one credit per
   *  (day, game), repeats are no-ops. Signed-in: an optimistic bump only;
   *  pass the server-credited amount from arcadeSubmitRun (0 on duplicate),
   *  the wallet stays authoritative on the next load. */
  creditLocal: (slug: GameSlug, day: number, comets: number) => void;
} {
  const { user } = useAuth();
  const [total, setTotal] = useState(0);
  const [ready, setReady] = useState(false);
  const migratedRef = useRef<string | null>(null);

  // Anonymous: load from localStorage after mount and stay in sync across tabs.
  useEffect(() => {
    if (user) return;
    setTotal(read().total);
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setTotal(read().total);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [user]);

  // Signed in: merge any guest comets once, then read the wallet.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      if (migratedRef.current !== user.id) {
        const local = read();
        const claims = toClaims(local);
        if (claims.length > 0) {
          try {
            const result = await arcadeMergeGuest({ runs: claims, clientTotal: local.total });
            // The RPC reports failure as {error}, it does not throw; clearing
            // local data before this check would destroy the guest's comets.
            if (result.error) {
              console.error("[comets] guest merge failed:", result.error);
              // Keep the blob and leave migratedRef unset so a later mount retries.
            } else {
              clearLocal();
              migratedRef.current = user.id;
            }
          } catch (e) {
            console.error("[comets] guest merge unreachable:", e);
          }
        } else {
          migratedRef.current = user.id;
        }
      }

      const wallet = await fetchWalletTotal(user.id);
      if (cancelled) return;
      if (wallet !== null) setTotal(wallet);
      // Ready even if the read failed, so the chip renders what it has
      // instead of hiding forever.
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const creditLocal = useCallback(
    (slug: GameSlug, day: number, comets: number) => {
      if (comets <= 0) return;
      if (user) {
        // Optimistic display only; the wallet row is the truth next load.
        setTotal((t) => t + comets);
        return;
      }
      const blob = read();
      const dayKey = String(day);
      if (blob.byDay[dayKey]?.[slug] !== undefined) return; // already credited today
      blob.byDay[dayKey] = { ...blob.byDay[dayKey], [slug]: comets };
      blob.total += comets;
      write(blob);
      setTotal(blob.total);
    },
    [user],
  );

  return { total, ready, creditLocal };
}
