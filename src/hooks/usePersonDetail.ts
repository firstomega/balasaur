import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getPersonDetail } from "@/lib/media.functions";

export const personDetailQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["person", id],
    queryFn: () => getPersonDetail({ data: { id } }),
    staleTime: 1000 * 60 * 10,
  });

export function usePersonDetail(id: string) {
  return useSuspenseQuery(personDetailQueryOptions(id));
}
