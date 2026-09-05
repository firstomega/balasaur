import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  // Track the signed-in user id so we only refetch user-scoped data when the
  // identity actually changes. Supabase fires onAuthStateChange on a timer for
  // TOKEN_REFRESHED (autoRefreshToken is on), and invalidating ALL queries there
  // would re-fetch everything — including the whole catalog — on every refresh.
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      const uid = s?.user?.id ?? null;
      // The first event after mount reports the session that was already in
      // storage. It is the baseline, not a change: every query keyed on the
      // user starts once `user` is set, and the shared ones do not depend on
      // who is signed in. Invalidating here cancelled and restarted every
      // fetch the page had just started, on every load, for anyone signed
      // in, right on top of hydration.
      if (event === "INITIAL_SESSION") {
        lastUserId.current = uid;
        return;
      }
      // Only invalidate when who's signed in actually changes (sign in / out /
      // switch user) or the user record was updated, not on token refresh.
      if (uid !== lastUserId.current || event === "USER_UPDATED") {
        lastUserId.current = uid;
        void qc.invalidateQueries();
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      lastUserId.current = data.session?.user?.id ?? null;
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  const value = useMemo<AuthCtx>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
