import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  queryCatalog,
  getCatalogFacets,
  getViewerCountry,
  type CatalogQueryParams,
} from "@/lib/catalog.functions";
import type { FilterState } from "@/types/filters";
import { YEAR_BOUNDS, defaultFilterState } from "@/types/filters";

export const PAGE_SIZE = 60;

export type CatalogBaseParams = Omit<CatalogQueryParams, "limit" | "offset">;

/** Map the UI's FilterState into the server query params (Sets → arrays, ranges).
 *  `region` is the viewer's account region for the per-country streaming filter. */
export function filtersToParams(filters: FilterState, region = "US"): CatalogBaseParams {
  const yearFull =
    filters.yearRange[0] === YEAR_BOUNDS[0] && filters.yearRange[1] === YEAR_BOUNDS[1];
  return {
    region,
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
    subGenres: [...filters.subGenres],
    themes: [...filters.themes],
    audience: [...filters.audience],
    completion: [...filters.completion],
    filmLength: [...filters.filmLength],
    sort: filters.sort,
  };
}

/** Merge the location-boost country into base params (dropping it when empty so the
 *  query key matches the un-boosted case). Keeps facet/deck params boost-free. */
export function withBoost(base: CatalogBaseParams, boostCountry?: string): CatalogBaseParams {
  return { ...base, boostCountry: boostCountry || undefined };
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

export function useCatalogInfinite(filters: FilterState, region = "US", boostCountry = "") {
  return useInfiniteQuery(
    catalogInfiniteOptions(withBoost(filtersToParams(filters, region), boostCountry)),
  );
}

/** Session-stable geo lookup for the viewer's country (from the edge geo header). */
export function viewerCountryOptions() {
  return queryOptions({
    queryKey: ["viewer-country"] as const,
    queryFn: () => getViewerCountry(),
    staleTime: Infinity,
  });
}

export function useViewerCountry() {
  return useQuery(viewerCountryOptions()).data ?? "";
}

export function catalogFacetsOptions(base: CatalogBaseParams) {
  return queryOptions({
    queryKey: ["catalog-facets", base] as const,
    queryFn: () => getCatalogFacets({ data: base }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCatalogFacets(filters: FilterState, region = "US") {
  return useQuery(catalogFacetsOptions(filtersToParams(filters, region)));
}

/** Bounded, popularity-ordered deck for the "Rate" (swipe) page. Loads a few hundred
 *  mainstream titles instead of the whole ~10k catalog the page used to pull (which made
 *  it slow to load / unresponsive). Popular-first also means people see titles they've
 *  most likely already watched, so they build their history faster. Already-rated titles
 *  are filtered out client-side by the deck. */
export const DECK_SIZE = 500;

export function deckMediaOptions(region = "US", boostCountry = "") {
  const base = withBoost(filtersToParams(defaultFilterState(), region), boostCountry);
  return queryOptions({
    queryKey: ["catalog-deck", region, boostCountry || "", DECK_SIZE] as const,
    queryFn: async () =>
      (await queryCatalog({ data: { ...base, limit: DECK_SIZE, offset: 0 } })).items,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDeckMedia(region = "US", boostCountry = "") {
  return useSuspenseQuery(deckMediaOptions(region, boostCountry));
}
