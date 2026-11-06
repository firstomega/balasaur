import { createServerFn } from "@tanstack/react-start";
import { loadPosterColorsMany } from "./media.server";
import type { SwatchKey } from "./posterSwatch";

// The tile swatch for titles a page knows only from a visitor's own library.
// Those records carry a snapshot (title, poster, year) taken when the title was
// filed, and no colour, so a personal page asks for the colours after mount.

const MEDIA_ID_RE = /^(movie|tv)-\d{1,10}$/;
/** A library larger than this paints its first titles and leaves the rest on
 *  the neutral tile; one indexed read either way. */
export const SWATCH_LOOKUP_MAX = 600;

/**
 * Swatch by media id, for the ids that have one. Fail-soft: a database that
 * does not answer gives back an empty map and every card keeps the paper tile.
 */
export const getPosterSwatches = createServerFn({ method: "POST" })
  .inputValidator((data: { ids: string[] }) => {
    const ids = Array.isArray(data?.ids) ? data.ids : [];
    return {
      ids: [...new Set(ids.filter((id) => typeof id === "string" && MEDIA_ID_RE.test(id)))].slice(
        0,
        SWATCH_LOOKUP_MAX,
      ),
    };
  })
  .handler(async ({ data }): Promise<Record<string, SwatchKey>> => {
    const out: Record<string, SwatchKey> = {};
    if (data.ids.length === 0) return out;
    try {
      const paint = await loadPosterColorsMany(data.ids);
      for (const [id, p] of paint) if (p.swatch) out[id] = p.swatch;
    } catch (e) {
      console.error("[swatches] lookup failed:", e);
    }
    return out;
  });
