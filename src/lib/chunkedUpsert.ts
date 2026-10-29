// Write rows in fixed-size chunks, giving a chunk that timed out one second
// chance as two smaller halves.
//
// Why only timeouts: from 22 Sep the nightly catalog sync failed on 7 of 10
// nights, every time the same way. One 25-row chunk of the `media` upsert hit
// "canceling statement due to statement timeout" while the other eleven chunks
// in that pass landed, on a different pass each night. A slow write is worth
// retrying smaller; any other error (bad column, permissions, constraint) will
// fail identically on retry, so it is reported at once instead.
//
// Two timeouts count. The database's own ("canceling statement due to
// statement timeout") and the server's request cutoff ("TimeoutError: The
// operation was aborted due to timeout"), which fires when a write waits too
// long for a database connection. From 19 Oct the second one failed the sync
// on 9 of 10 nights while scrapers kept every connection busy, and the retry
// above never fired because it only knew the first. Retrying either is safe:
// an upsert writes the same values however many times it lands.
//
// Nothing here is allowed to fail quietly. A chunk that still fails after the
// retry is counted, and the caller throws on any failure exactly as before.
// Retries are counted too, so a night that survived by retrying says so.

export interface WriteResult {
  error: { message: string } | null;
}

export interface ChunkedUpsertResult {
  totalChunks: number;
  /** Chunks that never landed, after any retry. The caller must treat > 0 as failure. */
  failedChunks: number;
  firstError: string | null;
  /** Chunks that timed out at first and were written successfully as halves. */
  recoveredChunks: number;
}

export function isTimeout(message: string): boolean {
  return /statement timeout|TimeoutError|aborted due to timeout/i.test(message);
}

export async function upsertInChunks<T>(
  rows: T[],
  write: (chunk: T[]) => Promise<WriteResult>,
  opts: { chunkSize?: number; pauseMs?: number; onError?: (message: string) => void } = {},
): Promise<ChunkedUpsertResult> {
  const chunkSize = opts.chunkSize ?? 25;
  const pauseMs = opts.pauseMs ?? 1_000;
  const result: ChunkedUpsertResult = {
    totalChunks: Math.ceil(rows.length / chunkSize),
    failedChunks: 0,
    firstError: null,
    recoveredChunks: 0,
  };
  const fail = (message: string) => {
    result.failedChunks++;
    result.firstError ??= message;
    opts.onError?.(message);
  };

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await write(chunk);
    if (!error) continue;
    if (!isTimeout(error.message) || chunk.length < 2) {
      fail(error.message);
      continue;
    }
    // A short pause lets whatever made this write slow finish before retrying.
    if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));
    const mid = Math.ceil(chunk.length / 2);
    let halvesFailed = false;
    for (const half of [chunk.slice(0, mid), chunk.slice(mid)]) {
      const retry = await write(half);
      if (retry.error) {
        halvesFailed = true;
        result.firstError ??= retry.error.message;
        opts.onError?.(retry.error.message);
      }
    }
    if (halvesFailed) result.failedChunks++;
    else result.recoveredChunks++;
  }
  return result;
}
