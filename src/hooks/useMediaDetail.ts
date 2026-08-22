import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getMediaDetail } from "@/lib/media.functions";
import { getAppearsIn } from "@/lib/collections.functions";

export const mediaDetailQueryOptions = (type: "movie" | "tv", id: string) =>
  queryOptions({
    queryKey: ["media", "detail", type, id],
    queryFn: () => getMediaDetail({ data: { type, id } }),
    staleTime: 1000 * 60 * 10,
  });

export function useMediaDetail(type: "movie" | "tv", id: string) {
  return useSuspenseQuery(mediaDetailQueryOptions(type, id));
}

/** Collections a title ranks in. Shared with the route loader so the links are
 *  in the server-rendered HTML: as a client-only query they existed for people
 *  and not for a crawler, and the /best/ shelves were the family Google had
 *  crawled least. */
export const appearsInQueryOptions = (mediaId: string) =>
  queryOptions({
    queryKey: ["appears-in", mediaId],
    queryFn: () => getAppearsIn({ data: { mediaId } }),
    staleTime: 60 * 60 * 1000,
  });
