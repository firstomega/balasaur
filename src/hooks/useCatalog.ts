import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { queryCatalog, getCatalogFacets, type CatalogQueryParams } from "@/lib/catalog.functions";
import type { FilterState } from "@/types/filters";
import { YEAR_BOUNDS } from "@/types/filters";

export const PAGE_SIZE = 60;

export type CatalogBaseParams = Omit<CatalogQueryParams, "limit" | "offset">;

/** Map the UI's FilterState into the server query params (Sets → arrays, ranges). */
export function filtersToParams(filters: FilterState): CatalogBaseParams {
  const yearFull =
    filters.yearRange[0] === YEAR_BOUNDS[0] && filters.yearRange[1] === YEAR_BOUNDS[1];
  return {
    types: [...filters.mediaTypes],
    genres: [...filters.genres],
    origins: [...filters.origins],
    streaming: [...filters.streaming],
    yearMin: yearFull ? undefined : filters.yearRange[0],
    yearMax: yearFull ? undefined : filters.yearRange[1],
    imdbMin: filters.imdbRange[0],
    imdbMax: filters.imdbRange[1],
    imdbUnrated: filters.includeUnratedImdb,
    rtMin: filters.rtRange[0],
    rtMax: filters.rtRange[1],
    rtUnrated: filters.includeUnratedRt,
    metaMin: filters.metaRange[0],
    metaMax: filters.metaRange[1],
    metaUnrated: filters.includeUnratedMeta,
    people: filters.people,
    awardWinners: filters.awardWinners,
    nominated: filters.nominated,
    awardsWon: [...filters.awardsWon],
    awardsNominated: [...filters.awardsNominated],
    sort: filters.sort,
  };
}

export function catalogInfiniteOptions(base: CatalogBaseParams) {
  return infiniteQueryOptions({
    queryKey: ["catalog", base] as const,
    queryFn: ({ pageParam }) =>
      queryCatalog({ data: { ...base, limit: PAGE_SIZE, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, pg) => n + pg.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCatalogInfinite(filters: FilterState) {
  return useInfiniteQuery(catalogInfiniteOptions(filtersToParams(filters)));
}

export function catalogFacetsOptions(base: CatalogBaseParams) {
  return queryOptions({
    queryKey: ["catalog-facets", base] as const,
    queryFn: () => getCatalogFacets({ data: base }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCatalogFacets(filters: FilterState) {
  return useQuery(catalogFacetsOptions(filtersToParams(filters)));
}
