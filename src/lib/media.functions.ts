import { createServerFn } from "@tanstack/react-start";
import {
  fetchMediaDetail,
  fetchPersonDetail,
  fetchTrendingMedia,
} from "./media.server";

export const getTrendingMedia = createServerFn({ method: "GET" }).handler(async () => {
  return fetchTrendingMedia();
});

const ID_RE = /^[1-9]\d{0,9}$/;

export const getMediaDetail = createServerFn({ method: "GET" })
  .inputValidator((data: { type: "movie" | "tv"; id: string }) => {
    if (!data || (data.type !== "movie" && data.type !== "tv")) {
      throw new Error("Invalid media type");
    }
    if (typeof data.id !== "string" || !ID_RE.test(data.id)) {
      throw new Error("Invalid media id");
    }
    return { type: data.type, id: data.id };
  })
  .handler(({ data }) => fetchMediaDetail(data.type, data.id));

export const getPersonDetail = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => {
    if (!data || typeof data.id !== "string" || !ID_RE.test(data.id)) {
      throw new Error("Invalid person id");
    }
    return { id: data.id };
  })
  .handler(({ data }) => fetchPersonDetail(data.id));
