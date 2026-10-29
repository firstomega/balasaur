import { describe, expect, it } from "bun:test";
import { isTimeout, upsertInChunks, type WriteResult } from "./chunkedUpsert";

const TIMEOUT = "canceling statement due to statement timeout";
/** What the server's own request cutoff reports, verbatim from the 28 Oct run. */
const CLIENT_TIMEOUT = "TimeoutError: The operation was aborted due to timeout";
const rowsOf = (n: number) => Array.from({ length: n }, (_, i) => i);
const json = (v: unknown) => JSON.stringify(v);

/** A fake table: records every row that landed and every call made. */
function fakeWriter(failFor: (chunk: number[], call: number) => string | null) {
  const landed: number[] = [];
  const calls: number[][] = [];
  const write = async (chunk: number[]): Promise<WriteResult> => {
    calls.push(chunk);
    const message = failFor(chunk, calls.length);
    if (message) return { error: { message } };
    landed.push(...chunk);
    return { error: null };
  };
  return { write, landed, calls };
}

describe("upsertInChunks", () => {
  it("writes every row once when nothing fails", async () => {
    const t = fakeWriter(() => null);
    const r = await upsertInChunks(rowsOf(60), t.write, { pauseMs: 0 });
    expect(r.totalChunks).toBe(3);
    expect(r.failedChunks).toBe(0);
    expect(r.recoveredChunks).toBe(0);
    expect(json(t.landed)).toBe(json(rowsOf(60)));
  });

  it("recovers a chunk that timed out by writing it again as two halves", async () => {
    // The second chunk (rows 25..49) times out on its first attempt only:
    // the night that used to fail the whole sync.
    const t = fakeWriter((chunk, call) =>
      chunk[0] === 25 && chunk.length === 25 && call === 2 ? TIMEOUT : null,
    );
    const r = await upsertInChunks(rowsOf(60), t.write, { pauseMs: 0 });
    expect(r.failedChunks).toBe(0);
    expect(r.recoveredChunks).toBe(1);
    expect(json([...t.landed].sort((a, b) => a - b))).toBe(json(rowsOf(60)));
    expect(json(t.calls.map((c) => c.length))).toBe(json([25, 25, 13, 12, 10]));
  });

  it("does not retry an error that is not a timeout", async () => {
    const t = fakeWriter((chunk) => (chunk[0] === 25 ? 'column "nope" does not exist' : null));
    const r = await upsertInChunks(rowsOf(60), t.write, { pauseMs: 0 });
    expect(r.failedChunks).toBe(1);
    expect(r.firstError).toBe('column "nope" does not exist');
    expect(t.calls.length).toBe(3);
  });

  it("still reports failure when the retry times out as well", async () => {
    const t = fakeWriter((chunk) => (chunk[0] >= 25 && chunk[0] < 50 ? TIMEOUT : null));
    const r = await upsertInChunks(rowsOf(60), t.write, { pauseMs: 0 });
    expect(r.failedChunks).toBe(1);
    expect(r.recoveredChunks).toBe(0);
    expect(r.firstError).toBe(TIMEOUT);
  });

  it("counts a one-row chunk that times out as failed, since it cannot be split", async () => {
    const t = fakeWriter(() => TIMEOUT);
    const r = await upsertInChunks(rowsOf(1), t.write, { pauseMs: 0 });
    expect(r.failedChunks).toBe(1);
    expect(t.calls.length).toBe(1);
  });

  it("recovers a chunk the server gave up on while it waited for a connection", async () => {
    // 19 to 28 Oct: the write never reached the database in time, so the
    // server's own cutoff fired instead of Postgres's.
    const t = fakeWriter((chunk, call) =>
      chunk[0] === 25 && chunk.length === 25 && call === 2 ? CLIENT_TIMEOUT : null,
    );
    const r = await upsertInChunks(rowsOf(60), t.write, { pauseMs: 0 });
    expect(r.failedChunks).toBe(0);
    expect(r.recoveredChunks).toBe(1);
    expect(json([...t.landed].sort((a, b) => a - b))).toBe(json(rowsOf(60)));
  });

  it("recognises both timeouts and nothing else", () => {
    expect(isTimeout(TIMEOUT)).toBe(true);
    expect(isTimeout(CLIENT_TIMEOUT)).toBe(true);
    expect(isTimeout("duplicate key value violates unique constraint")).toBe(false);
    expect(isTimeout('column "nope" does not exist')).toBe(false);
    expect(isTimeout("AbortError: The user aborted a request.")).toBe(false);
  });
});
