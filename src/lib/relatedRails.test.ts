import { describe, expect, it } from "bun:test";
import { settleRelatedRails } from "./media.server";
import type { MediaDetail, MediaItem } from "@/types/media";

// The engine version stamp is what keeps a title's rails for seven days. A
// rail the gate refused is an answer and is stamped; a read that failed or
// timed out is not, so the next view retries it.

function detail(over: Partial<MediaDetail> = {}): MediaDetail {
  return {
    id: "movie-348",
    mediaType: "movie",
    title: "Alien",
    year: "1979",
    genres: ["Horror", "Science Fiction"],
    ratings: {},
    ...over,
  } as MediaDetail;
}

const rail = [{ id: "movie-679", title: "Aliens" }] as MediaItem[];
const ok = <T>(value: T): PromiseFulfilledResult<T> => ({ status: "fulfilled", value });
const timedOut: PromiseRejectedResult = {
  status: "rejected",
  reason: new Error("canceling statement due to statement timeout"),
};

describe("settleRelatedRails", () => {
  it("stamps the version when every read answered", () => {
    const d = detail();
    settleRelatedRails(d, [ok(rail), ok(rail), ok(null)]);
    expect(d.related).toEqual(rail);
    expect(d.relatedVersion).toBe(3);
  });

  it("stamps a rail the quality gate refused, so it is not rebuilt on every view", () => {
    const d = detail();
    settleRelatedRails(d, [ok(undefined), ok(undefined), ok(null)]);
    expect(d.related).toBeUndefined();
    expect(d.relatedVersion).toBe(3);
  });

  it("leaves the version unset when the related read fails, so the next view retries", () => {
    const d = detail();
    settleRelatedRails(d, [timedOut, ok(rail), ok(null)]);
    expect(d.relatedVersion).toBeUndefined();
    expect(d.relatedCross).toEqual(rail);
  });

  it("keeps the rail a cached payload already had when the rebuild read fails", () => {
    const d = detail({ related: rail, relatedVersion: 2 });
    settleRelatedRails(d, [timedOut, timedOut, ok(null)]);
    expect(d.related).toEqual(rail);
    expect(d.relatedVersion).toBe(2);
  });

  it("leaves the version unset when the title context read fails", () => {
    const d = detail();
    settleRelatedRails(d, [ok(rail), ok(rail), timedOut]);
    expect(d.related).toEqual(rail);
    expect(d.relatedVersion).toBeUndefined();
  });

  it("attaches the cohort when the context read answered", () => {
    const d = detail();
    settleRelatedRails(d, [
      ok(rail),
      ok(rail),
      ok({ cohort_label: "1970s science fiction", cohort_size: 140, percentile: 99 }),
    ]);
    expect(d.context?.cohort).toEqual({
      label: "1970s science fiction",
      size: 140,
      percentile: 99,
    });
  });
});
