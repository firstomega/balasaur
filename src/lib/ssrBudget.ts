/** Bound an SSR-loader await so the document ALWAYS streams. If the work doesn't
 *  settle within `ms`, resolve anyway — the page renders (skeleton/empty state) and
 *  React Query refetches on the client, so a slow or dead backend degrades to a
 *  self-healing empty grid instead of an infinitely spinning tab (2026-07-02 incident).
 *  Never rejects. */
export function ssrBudget<T>(work: Promise<T>, ms = 5000): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}
