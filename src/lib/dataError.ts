// A database read that failed is not an empty result. Server functions throw
// this instead of returning [] or null, so the page that asked renders its
// error state as a 500, which the server entry sends no-store (below), rather
// than a 200 empty month or a 404 that a CDN keeps for six hours.
//
// A read that succeeds with zero rows is still an empty result and still
// returns one; only a failure throws.

export class DataUnavailableError extends Error {
  constructor(what: string) {
    super(what);
    this.name = "DataUnavailableError";
  }
}

/** Log a failed read and return the error to throw, so every call site reads
 *  `if (error) throw dataUnavailable("[calendar] query failed", error)`. The
 *  database's own message goes to the server log only: a thrown error is
 *  serialized into the page for hydration, and a Postgres message can name
 *  tables and columns. */
export function dataUnavailable(
  what: string,
  error: { message?: string } | null | undefined,
): DataUnavailableError {
  console.error(`${what}:`, error?.message);
  return new DataUnavailableError(what);
}

/**
 * Mark a 5xx response no-store. The framework drops headers a loader sets on
 * any response that is not a 2xx, so an error page cannot ask for this itself;
 * the server entry applies it to every response on the way out. A 2xx, 3xx or
 * 4xx passes through untouched.
 */
export function noStoreOnServerError(response: Response): Response {
  if (response.status < 500) return response;
  try {
    response.headers.set("cache-control", "no-store");
    return response;
  } catch {
    // The headers of a fetched response are immutable: copy them.
    const headers = new Headers(response.headers);
    headers.set("cache-control", "no-store");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}
