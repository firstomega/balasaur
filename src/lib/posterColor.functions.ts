import { createServerFn } from "@tanstack/react-start";
import { loadPosterColors } from "./media.server";

// Read side of the ambient glow. The write side (poster download, quantize,
// the two hex values on `media`) lives in media.server.ts behind the nightly
// sync endpoint; nothing here fetches an image.

const MEDIA_ID_RE = /^(movie|tv)-\d{1,10}$/;

/**
 * The two stored colors for one title, or null when it has none.
 *
 * Called from the `/movie/$id` and `/tv/$id` loaders so the glow is painted in
 * the server-rendered HTML rather than appearing a second later. Fail-soft:
 * a database that will not answer gives back null and the page keeps its flat
 * ground, which is what a title with no stored colors gets anyway.
 */
export const getPosterColors = createServerFn({ method: "GET" })
  .inputValidator((data: { mediaId: string }) => {
    if (!data || typeof data.mediaId !== "string" || !MEDIA_ID_RE.test(data.mediaId)) {
      throw new Error("Invalid media id");
    }
    return { mediaId: data.mediaId };
  })
  .handler(async ({ data }) => {
    try {
      return await loadPosterColors(data.mediaId);
    } catch (e) {
      console.error(`[colors] lookup failed for ${data.mediaId}:`, e);
      return null;
    }
  });
