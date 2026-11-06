import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPosterSwatches } from "@/lib/swatches.functions";
import type { SwatchKey } from "@/lib/posterSwatch";

const NONE: Record<string, SwatchKey> = {};

/**
 * Swatches for titles known only from the visitor's own records. Client-only
 * by construction: it is called with ids that exist after mount, so the cached
 * page never carries them. Until the answer arrives, and for any id without a
 * swatch, the caller paints the neutral tile, which has the same layout.
 */
export function usePosterSwatches(ids: string[]): Record<string, SwatchKey> {
  const fn = useServerFn(getPosterSwatches);
  const key = [...ids].sort().join(",");
  const { data } = useQuery({
    queryKey: ["poster-swatches", key],
    queryFn: () => fn({ data: { ids: key ? key.split(",") : [] } }),
    enabled: key.length > 0,
    staleTime: 60 * 60 * 1000,
    // A title just filed changes the key; the cards already painted keep
    // their colour while the new answer comes back.
    placeholderData: (prev) => prev,
  });
  return data ?? NONE;
}
