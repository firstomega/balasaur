export function MediaCardSkeleton() {
  return (
    // The paper card at rest: the same box a card with no swatch draws, so the
    // swap to real cards moves nothing.
    <div className="flex flex-col rounded-xl bg-panel p-1.5 pb-2 md:p-2 md:pb-2.5">
      <div className="aspect-[2/3] w-full animate-pulse rounded-lg bg-secondary" />
      <div className="mt-2 space-y-1.5 px-0.5">
        <div className="h-3 w-4/5 animate-pulse rounded-sm bg-secondary" />
        <div className="h-2.5 w-1/2 animate-pulse rounded-sm bg-secondary" />
      </div>
    </div>
  );
}

export function MediaGridSkeleton({ count = 24 }: { count?: number }) {
  return (
    <div
      className="grid gap-[13px]"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(142px, 1fr))" }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <MediaCardSkeleton key={i} />
      ))}
    </div>
  );
}
