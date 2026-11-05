import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { posterReadPatch, readPosterBytes } from "./posterRead";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`./__fixtures__/posters/${name}.jpg`, import.meta.url)));

describe("the nightly poster read", () => {
  it("gives glow colours and a swatch from one poster", () => {
    const read = readPosterBytes(fixture("the-sopranos"));
    expect(/^#[0-9a-f]{6}$/.test(read.colors?.colorA ?? "")).toBe(true);
    expect(read.swatch?.swatch).toBe("red");
  });

  it("stamps both readings, with nulls, when the bytes are not a poster", () => {
    const read = readPosterBytes(new Uint8Array([1, 2, 3, 4]));
    expect(read).toEqual({ colors: null, swatch: null });
    const at = "2026-11-05T23:00:00.000Z";
    expect(posterReadPatch(read, at)).toEqual({
      color_a: null,
      color_b: null,
      color_at: at,
      swatch: null,
      swatch_alt: null,
      swatch_at: at,
    });
  });

  it("writes the swatch keys the database accepts", () => {
    const patch = posterReadPatch(readPosterBytes(fixture("alien")), "2026-11-05T23:00:00.000Z");
    expect(patch.swatch).toBe("noir");
    expect(patch.swatch_at).toBe(patch.color_at);
  });

  it("queues a title while either stamp is missing", () => {
    // media.server.ts cannot be imported here (it needs the service client),
    // so the queue filter is read from its source.
    const src = readFileSync(new URL("./media.server.ts", import.meta.url), "utf8");
    expect(src).toContain('const POSTER_QUEUE = "color_at.is.null,swatch_at.is.null";');
    expect(src).not.toContain('.filter("color_at", "is", null)');
    expect(src.match(/\.or\(POSTER_QUEUE\)/g)?.length).toBe(3);
  });
});
