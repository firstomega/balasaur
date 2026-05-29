export function MediaCardSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="aspect-[2/3] w-full animate-pulse rounded-[5px] border border-border bg-panel" />
      <div className="mt-2 space-y-1.5 px-0.5">
        <div className="h-3 w-4/5 animate-pulse rounded bg-panel" />
        <div className="h-2.5 w-1/2 animate-pulse rounded bg-panel" />
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