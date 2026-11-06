// Test-only stand-in for the Supabase client. Every query-builder call
// (.select, .eq, .order, .maybeSingle ...) returns the same builder, and
// awaiting it resolves to the reply configured for that table or RPC, which
// is the { data, error, count } shape PostgREST returns. Not imported by app
// code.

export interface StubReply {
  data?: unknown;
  error?: { message: string } | null;
  count?: number | null;
}

export function stubSupabase(replies: Record<string, StubReply>) {
  const reads: string[] = [];
  const builder = (key: string): unknown => {
    const reply = { data: null, error: null, count: null, ...(replies[key] ?? { data: [] }) };
    const b: unknown = new Proxy(
      {},
      {
        get(_, prop) {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) =>
              Promise.resolve(reply).then(ok, fail);
          }
          return () => b;
        },
      },
    );
    return b;
  };
  return {
    reads,
    from(table: string) {
      reads.push(table);
      return builder(table);
    },
    rpc(name: string) {
      reads.push(name);
      return builder(name);
    },
  };
}

/** The reply a failed read gets: a statement timeout, as the gateway logs show. */
export const FAILED = { error: { message: "canceling statement due to statement timeout" } };

/** What a promise rejected with, or undefined when it resolved. */
export async function rejectionOf(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  return undefined;
}
