import { createServerFn } from "@tanstack/react-start";
import { fetchTrendingMedia } from "./media.server";

export const getTrendingMedia = createServerFn({ method: "GET" }).handler(async () => {
  return fetchTrendingMedia();
});