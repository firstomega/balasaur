import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getTrendingMedia } from "@/lib/media.functions";

export const mediaItemsQueryOptions = queryOptions({
  queryKey: ["media", "trending"],
  queryFn: () => getTrendingMedia(),
  staleTime: 1000 * 60 * 60, // catalog is served from our DB, can sit longer
});

export function useMediaItems() {
  return useSuspenseQuery(mediaItemsQueryOptions);
}