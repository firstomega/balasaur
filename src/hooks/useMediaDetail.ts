import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getMediaDetail } from "@/lib/media.functions";

export const mediaDetailQueryOptions = (type: "movie" | "tv", id: string) =>
  queryOptions({
    queryKey: ["media", "detail", type, id],
    queryFn: () => getMediaDetail({ data: { type, id } }),
    staleTime: 1000 * 60 * 10,
  });

export function useMediaDetail(type: "movie" | "tv", id: string) {
  return useSuspenseQuery(mediaDetailQueryOptions(type, id));
}