import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getTrendingMedia } from "@/lib/media.functions";

export const mediaItemsQueryOptions = queryOptions({
  queryKey: ["media", "trending"],
  queryFn: () => getTrendingMedia(),
  staleTime: 1000 * 60 * 10,
});

export function useMediaItems() {
  return useSuspenseQuery(mediaItemsQueryOptions);
}